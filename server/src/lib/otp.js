import crypto from 'node:crypto';
import { config, isTestPhone } from '../config.js';
import { newId, nowIso, one, run } from '../db/index.js';
import { badRequest, tooManyRequests } from './errors.js';
import { notifyOtp } from './notifications.js';

const hashCode = (phone, code) =>
  crypto.createHash('sha256').update(`${phone}:${code}:${config.jwtSecret}`).digest('hex');

const safeEqual = (a, b) => {
  const left = Buffer.from(String(a));
  const right = Buffer.from(String(b));
  if (left.length !== right.length) return false;
  return crypto.timingSafeEqual(left, right);
};

/**
 * Creates a one-time code for a phone number.
 *
 * Test-mode numbers (see TEST_LOGIN_* in .env) always accept the fixed OTP and
 * are reported as `testMode` so the interface can label them clearly. Numbers
 * outside the allowlist always get a real random code — there is no fixed code
 * for production traffic.
 */
export function issueOtp(phone) {
  const now = Date.now();
  const latest = one('SELECT * FROM otp_codes WHERE phone = ? ORDER BY created_at DESC LIMIT 1', [
    phone,
  ]);

  if (latest) {
    const ageSeconds = (now - new Date(latest.created_at).getTime()) / 1000;
    if (ageSeconds < config.otp.resendSeconds) {
      throw tooManyRequests(
        `A code was just sent. Please wait ${Math.ceil(
          config.otp.resendSeconds - ageSeconds,
        )} seconds before requesting another.`,
      );
    }
  }

  const testMode = isTestPhone(phone);
  const code = testMode ? config.testLogin.otp : String(crypto.randomInt(0, 1_000_000)).padStart(6, '0');
  const expiresAt = new Date(now + config.otp.ttlMinutes * 60_000).toISOString();

  run(
    `INSERT INTO otp_codes (id, phone, code_hash, test_mode, attempts, expires_at, created_at)
     VALUES (?, ?, ?, ?, 0, ?, ?)`,
    [newId(), phone, hashCode(phone, code), testMode ? 1 : 0, expiresAt, nowIso()],
  );

  void notifyOtp(phone, code, testMode);

  return {
    testMode,
    expiresAt,
    ttlMinutes: config.otp.ttlMinutes,
    // Only ever surfaced for allowlisted test numbers.
    testOtp: testMode ? config.testLogin.otp : undefined,
  };
}

/** Verifies a code and consumes it. Throws a clear error on any failure. */
export function verifyOtp(phone, code) {
  const row = one(
    `SELECT * FROM otp_codes WHERE phone = ? AND consumed_at IS NULL
     ORDER BY created_at DESC LIMIT 1`,
    [phone],
  );

  if (!row) {
    throw badRequest('No active code for this number. Request a new one.', [
      { field: 'code', message: 'No active code for this number.' },
    ]);
  }
  if (new Date(row.expires_at).getTime() < Date.now()) {
    throw badRequest('That code has expired. Request a new one.', [
      { field: 'code', message: 'That code has expired.' },
    ]);
  }
  if (row.attempts >= config.otp.maxAttempts) {
    throw badRequest('Too many incorrect attempts. Request a new code.', [
      { field: 'code', message: 'Too many incorrect attempts.' },
    ]);
  }

  const isFixedTestCode =
    row.test_mode === 1 &&
    config.testLogin.enabled &&
    isTestPhone(phone) &&
    code === config.testLogin.otp;

  const matches = isFixedTestCode || safeEqual(row.code_hash, hashCode(phone, code));

  if (!matches) {
    run('UPDATE otp_codes SET attempts = attempts + 1 WHERE id = ?', [row.id]);
    const left = config.otp.maxAttempts - (row.attempts + 1);
    throw badRequest(
      left > 0 ? `That code is not correct. ${left} attempt(s) left.` : 'Too many incorrect attempts. Request a new code.',
      [{ field: 'code', message: 'Incorrect code.' }],
    );
  }

  run('UPDATE otp_codes SET consumed_at = ? WHERE id = ?', [nowIso(), row.id]);
  return { testMode: row.test_mode === 1 };
}

export const normalisePhone = (raw) => String(raw ?? '').replace(/[\s\-()]/g, '').trim();
