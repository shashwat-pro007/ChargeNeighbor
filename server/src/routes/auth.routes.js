import express from 'express';
import { z } from 'zod';
import { config, isTestPhone } from '../config.js';
import { newId, nowIso, one, parseRoles, run, serializeUser } from '../db/index.js';
import { audit } from '../lib/audit.js';
import { clearSessionCookie, loadUser, requireAuth, setSessionCookie } from '../lib/auth.js';
import {
  fakeVerify,
  hashPassword,
  loginIdProblem,
  normaliseLoginId,
  passwordProblems,
  verifyPassword,
} from '../lib/credentials.js';
import { badRequest, conflict, forbidden, unauthorized } from '../lib/errors.js';
import { issueOtp, normalisePhone, verifyOtp } from '../lib/otp.js';
import { asyncHandler, parse } from '../lib/validate.js';
import { authLimiter } from '../middleware/guards.js';

const router = express.Router();

const phoneSchema = z
  .string({ required_error: 'Enter your phone number.' })
  .transform(normalisePhone)
  .refine((value) => /^\+?\d{10,15}$/.test(value), {
    message: 'Enter a valid phone number with country code, for example +919876543210.',
  });

const requestSchema = z.object({ phone: phoneSchema });

const verifySchema = z.object({
  phone: phoneSchema,
  code: z
    .string({ required_error: 'Enter the 6 digit code.' })
    .trim()
    .regex(/^\d{6}$/, 'The code is 6 digits.'),
  name: z.string().trim().max(60).optional(),
  intent: z.enum(['driver', 'host']).optional(),
});

router.post(
  '/otp/request',
  authLimiter,
  asyncHandler(async (req, res) => {
    const { phone } = parse(requestSchema, req.body);
    const result = issueOtp(phone);

    audit({ action: 'auth.otp_requested', entityType: 'user', meta: { phone, testMode: result.testMode }, ip: req.ip });

    res.json({
      phone,
      testMode: result.testMode,
      expiresAt: result.expiresAt,
      ttlMinutes: result.ttlMinutes,
      testOtp: result.testOtp,
      message: result.testMode
        ? 'Testing mode: this number uses the fixed test code.'
        : `We sent a 6 digit code to ${phone}. It expires in ${result.ttlMinutes} minutes.`,
    });
  }),
);

router.post(
  '/otp/verify',
  authLimiter,
  asyncHandler(async (req, res) => {
    const { phone, code, name, intent } = parse(verifySchema, req.body);

    const existing = one('SELECT * FROM users WHERE phone = ?', [phone]);
    if (existing?.status === 'suspended') {
      throw forbidden('This account is suspended. Contact support for help.');
    }

    const { testMode } = verifyOtp(phone, code);
    const now = nowIso();

    let user = existing;

    if (!user) {
      const roles = new Set(['driver']);
      if (intent === 'host') roles.add('host');
      if (config.adminPhones.includes(phone)) roles.add('admin');

      const id = newId();
      run(
        `INSERT INTO users (id, phone, name, roles, status, phone_verified_at, last_login_at, created_at, updated_at)
         VALUES (?, ?, ?, ?, 'active', ?, ?, ?, ?)`,
        [id, phone, name?.trim() || null, [...roles].join(','), now, now, now, now],
        // note: roles column order keeps driver first
      );
      if ([...roles].includes('host')) {
        run(
          `INSERT INTO host_profiles (user_id, display_name, verification, created_at, updated_at)
           VALUES (?, ?, 'none', ?, ?)`,
          [id, name?.trim() || null, now, now],
        );
      }
      user = one('SELECT * FROM users WHERE id = ?', [id]);
      audit({ actorId: id, action: 'auth.registered', entityType: 'user', entityId: id, ip: req.ip });
    } else {
      const roles = parseRoles(user.roles);
      if (intent === 'host' && !roles.includes('host')) {
        roles.push('host');
        run('UPDATE users SET roles = ? WHERE id = ?', [roles.join(','), user.id]);
        run(
          `INSERT INTO host_profiles (user_id, display_name, verification, created_at, updated_at)
           VALUES (?, ?, 'none', ?, ?)
           ON CONFLICT(user_id) DO NOTHING`,
          [user.id, name?.trim() || user.name, now, now],
        );
      }
      if (config.adminPhones.includes(phone) && !roles.includes('admin')) {
        roles.push('admin');
        run('UPDATE users SET roles = ? WHERE id = ?', [roles.join(','), user.id]);
      }
      if (name?.trim() && !user.name) {
        run('UPDATE users SET name = ? WHERE id = ?', [name.trim(), user.id]);
      }
      run('UPDATE users SET phone_verified_at = ?, last_login_at = ?, updated_at = ? WHERE id = ?', [
        now,
        now,
        now,
        user.id,
      ]);
      user = one('SELECT * FROM users WHERE id = ?', [user.id]);
      audit({ actorId: user.id, action: 'auth.login', entityType: 'user', entityId: user.id, ip: req.ip });
    }

    setSessionCookie(res, user);

    const fresh = one('SELECT * FROM users WHERE id = ?', [user.id]);
    res.json({
      user: serializeUser(fresh),
      testMode,
      isTestNumber: isTestPhone(phone),
      isNewAccount: !existing,
    });
  }),
);

const loginIdBody = z
  .string({ required_error: 'Enter your login ID.' })
  .transform(normaliseLoginId)
  .refine((value) => !loginIdProblem(value), {
    message: 'Use 4 to 20 characters: letters, numbers, dot or underscore, starting with a letter.',
  });

const passwordBody = z
  .string({ required_error: 'Enter your password.' })
  .min(1, 'Enter your password.')
  .max(100, 'That password is too long.');

/**
 * Password sign-in. The account is still created and verified by phone; a
 * login ID and password are optional credentials added from the account page.
 */
router.post(
  '/id/login',
  authLimiter,
  asyncHandler(async (req, res) => {
    const { loginId, password } = parse(
      z.object({ loginId: loginIdBody, password: passwordBody }),
      req.body,
    );

    const row = one('SELECT * FROM users WHERE login_id = ?', [loginId]);
    // Same generic answer for an unknown ID and a bad password.
    const ok = row ? verifyPassword(password, row.password_hash) : (fakeVerify(password), false);
    if (!ok) {
      audit({ action: 'auth.login_failed', entityType: 'user', meta: { loginId }, ip: req.ip });
      throw unauthorized('That login ID and password do not match.');
    }
    if (row.status === 'suspended') {
      throw forbidden('This account is suspended. Contact support for help.');
    }

    const now = nowIso();
    run('UPDATE users SET last_login_at = ?, updated_at = ? WHERE id = ?', [now, now, row.id]);
    setSessionCookie(res, row);
    audit({ actorId: row.id, action: 'auth.login_id', entityType: 'user', entityId: row.id, ip: req.ip });

    const fresh = one('SELECT * FROM users WHERE id = ?', [row.id]);
    res.json({ user: serializeUser(fresh) });
  }),
);

/**
 * Creates or replaces the login ID and password. The first password can be set
 * from a signed-in session (that session already proved phone ownership); any
 * later change needs the current password.
 */
router.post(
  '/id/set',
  authLimiter,
  requireAuth,
  asyncHandler(async (req, res) => {
    const { loginId, password, currentPassword } = parse(
      z.object({
        loginId: loginIdBody,
        password: passwordBody,
        currentPassword: z.string().max(100).optional(),
      }),
      req.body,
    );

    const user = one('SELECT * FROM users WHERE id = ?', [req.user.id]);
    if (!user) throw unauthorized();

    if (user.password_hash && !verifyPassword(currentPassword ?? '', user.password_hash)) {
      throw badRequest('Enter your current password to change your sign-in details.', [
        { field: 'currentPassword', message: 'That current password is not correct.' },
      ]);
    }

    const taken = one('SELECT id FROM users WHERE login_id = ? AND id <> ?', [loginId, user.id]);
    if (taken) {
      throw conflict('That login ID is already taken. Try another one.', [
        { field: 'loginId', message: 'Already taken.' },
      ]);
    }

    const problems = passwordProblems(password, { loginId, phone: user.phone });
    if (problems.length > 0) {
      throw badRequest(problems[0], [{ field: 'password', message: problems[0] }]);
    }

    // A password equal to the current one is still a valid re-save; no special case.
    const now = nowIso();
    run('UPDATE users SET login_id = ?, password_hash = ?, updated_at = ? WHERE id = ?', [
      loginId,
      hashPassword(password),
      now,
      user.id,
    ]);
    audit({
      actorId: user.id,
      action: user.password_hash ? 'auth.password_changed' : 'auth.password_set',
      entityType: 'user',
      entityId: user.id,
      ip: req.ip,
    });

    const fresh = one('SELECT * FROM users WHERE id = ?', [user.id]);
    res.json({
      user: serializeUser(fresh),
      message: user.password_hash
        ? 'Sign-in details updated. Use your login ID and password next time.'
        : 'Password set. You can now sign in with your login ID as well as your phone number.',
    });
  }),
);

router.post('/logout', loadUser, (req, res) => {
  clearSessionCookie(res);
  if (req.user) {
    audit({ actorId: req.user.id, action: 'auth.logout', entityType: 'user', entityId: req.user.id, ip: req.ip });
  }
  res.json({ ok: true });
});

router.get('/me', (req, res) => {
  if (!req.user) return res.json({ user: null });
  const hostProfile = one('SELECT * FROM host_profiles WHERE user_id = ?', [req.user.id]);
  const listingCounts = one(
    `SELECT
       SUM(CASE WHEN status = 'approved' THEN 1 ELSE 0 END) AS approved,
       SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) AS pending,
       SUM(CASE WHEN status = 'rejected' THEN 1 ELSE 0 END) AS rejected,
       COUNT(*) AS total
     FROM listings WHERE host_id = ?`,
    [req.user.id],
  );
  return res.json({
    user: req.user,
    hostProfile: hostProfile
      ? {
          displayName: hostProfile.display_name,
          about: hostProfile.about,
          verification: hostProfile.verification,
        }
      : null,
    listingCounts: {
      approved: listingCounts?.approved ?? 0,
      pending: listingCounts?.pending ?? 0,
      rejected: listingCounts?.rejected ?? 0,
      total: listingCounts?.total ?? 0,
    },
  });
});

/**
 * Account deletion: personal profile, vehicle and saved data are removed, the
 * phone number is released, and bookings are retained in anonymised form
 * because they are financial records the platform must keep.
 */
router.delete(
  '/account',
  requireAuth,
  asyncHandler(async (req, res) => {
    const { confirm } = parse(
      z.object({ confirm: z.literal('DELETE', { errorMap: () => ({ message: 'Type DELETE to confirm.' }) }) }),
      req.body,
    );
    if (!confirm) throw badRequest('Confirmation is required.');

    const active = one(
      `SELECT ref FROM bookings WHERE driver_id = ? AND status IN ('CONFIRMED','IN_PROGRESS') LIMIT 1`,
      [req.user.id],
    );
    if (active) {
      throw conflict(
        `You have an active booking (${active.ref}). Cancel it before deleting your account.`,
      );
    }

    const now = nowIso();
    run('UPDATE users SET name = NULL, email = NULL, phone = ?, status = ?, updated_at = ? WHERE id = ?', [
      `deleted-${req.user.id}`,
      'deleted',
      now,
      req.user.id,
    ]);
    run('DELETE FROM vehicles WHERE user_id = ?', [req.user.id]);
    run('DELETE FROM saved_listings WHERE user_id = ?', [req.user.id]);
    run('DELETE FROM notifications WHERE user_id = ?', [req.user.id]);
    run('UPDATE listings SET status = ?, updated_at = ? WHERE host_id = ?', [
      'paused',
      now,
      req.user.id,
    ]);

    audit({ actorId: req.user.id, action: 'account.deleted', entityType: 'user', entityId: req.user.id, ip: req.ip });
    clearSessionCookie(res);
    res.json({ ok: true });
  }),
);

export default router;
