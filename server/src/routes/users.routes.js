import express from 'express';
import { z } from 'zod';
import { all, newId, nowIso, one, run, serializeUser } from '../db/index.js';
import { requireAuth } from '../lib/auth.js';
import { notFound } from '../lib/errors.js';
import { asyncHandler, parse } from '../lib/validate.js';
import { audit } from '../lib/audit.js';
import { serializeListings } from '../services/serializers.js';
import { ALLOWED_CONNECTORS } from './listings.routes.js';

const router = express.Router();
router.use(requireAuth);

// Mounted at /me, so this handler answers PATCH /api/v1/me.
router.patch(
  '/',
  asyncHandler(async (req, res) => {
    const data = parse(
      z.object({
        name: z.string().trim().min(1, 'Enter your name.').max(60).optional(),
        email: z.string().trim().email('Enter a valid email address.').max(120).nullish(),
      }),
      req.body,
    );

    const now = nowIso();
    if (data.name !== undefined) {
      run('UPDATE users SET name = ?, updated_at = ? WHERE id = ?', [data.name, now, req.user.id]);
    }
    if (data.email !== undefined) {
      run('UPDATE users SET email = ?, updated_at = ? WHERE id = ?', [
        data.email || null,
        now,
        req.user.id,
      ]);
    }

    const fresh = one('SELECT * FROM users WHERE id = ?', [req.user.id]);
    res.json({ user: serializeUser(fresh), message: 'Profile updated.' });
  }),
);

/**
 * Enables hosting on an existing account without signing out. The account keeps
 * its driver role; host tools need this flag and a host profile row.
 */
router.post(
  '/host',
  asyncHandler(async (req, res) => {
    const roles = new Set(String(req.user.roles ?? '').split(','));
    roles.delete('');
    roles.add('host');
    const now = nowIso();

    run('UPDATE users SET roles = ?, updated_at = ? WHERE id = ?', [[...roles].join(','), now, req.user.id]);
    run(
      `INSERT INTO host_profiles (user_id, display_name, verification, created_at, updated_at)
       VALUES (?, ?, 'none', ?, ?)
       ON CONFLICT(user_id) DO NOTHING`,
      [req.user.id, req.user.name, now, now],
    );

    audit({ actorId: req.user.id, action: 'account.hosting_enabled', entityType: 'user', entityId: req.user.id, ip: req.ip });
    const fresh = one('SELECT * FROM users WHERE id = ?', [req.user.id]);
    res.json({ user: serializeUser(fresh), message: 'Hosting enabled. You can create a listing now.' });
  }),
);

/* ------------------------------------------------------------------ vehicles */

const vehicleSchema = z.object({
  label: z.string().trim().max(40).optional(),
  makeModel: z.string().trim().min(2, 'Enter your vehicle make and model.').max(80),
  connector: z.enum(ALLOWED_CONNECTORS, {
    errorMap: () => ({ message: 'Pick a supported connector type.' }),
  }),
  batteryKwh: z.coerce.number().min(5).max(200).nullish(),
  efficiency: z.coerce.number().min(50).max(500).nullish(),
  isDefault: z.boolean().optional(),
});

router.get(
  '/vehicles',
  asyncHandler(async (req, res) => {
    const rows = all('SELECT * FROM vehicles WHERE user_id = ? ORDER BY created_at ASC', [req.user.id]);
    res.json({
      vehicles: rows.map((row) => ({
        id: row.id,
        label: row.label,
        makeModel: row.make_model,
        connector: row.connector,
        batteryKwh: row.battery_kwh,
        efficiency: row.efficiency,
        isDefault: Boolean(row.is_default),
      })),
      connectors: ALLOWED_CONNECTORS,
    });
  }),
);

router.post(
  '/vehicles',
  asyncHandler(async (req, res) => {
    const data = parse(vehicleSchema, req.body);
    const id = newId();
    if (data.isDefault) {
      run('UPDATE vehicles SET is_default = 0 WHERE user_id = ?', [req.user.id]);
    }
    run(
      `INSERT INTO vehicles (id, user_id, label, make_model, connector, battery_kwh, efficiency, is_default, created_at)
       VALUES (?,?,?,?,?,?,?,?,?)`,
      [
        id,
        req.user.id,
        data.label ?? null,
        data.makeModel,
        data.connector,
        data.batteryKwh ?? null,
        data.efficiency ?? null,
        data.isDefault ? 1 : 0,
        nowIso(),
      ],
    );
    res.status(201).json({ id, message: 'Vehicle saved.' });
  }),
);

router.patch(
  '/vehicles/:id',
  asyncHandler(async (req, res) => {
    const existing = one('SELECT * FROM vehicles WHERE id = ? AND user_id = ?', [
      req.params.id,
      req.user.id,
    ]);
    if (!existing) throw notFound('That vehicle is not in your profile.');

    const data = parse(vehicleSchema.partial(), req.body);
    if (data.isDefault) {
      run('UPDATE vehicles SET is_default = 0 WHERE user_id = ?', [req.user.id]);
    }
    run(
      `UPDATE vehicles SET label = ?, make_model = ?, connector = ?, battery_kwh = ?, efficiency = ?, is_default = ?
       WHERE id = ? AND user_id = ?`,
      [
        data.label ?? existing.label,
        data.makeModel ?? existing.make_model,
        data.connector ?? existing.connector,
        data.batteryKwh ?? existing.battery_kwh,
        data.efficiency ?? existing.efficiency,
        data.isDefault === undefined ? existing.is_default : data.isDefault ? 1 : 0,
        existing.id,
        req.user.id,
      ],
    );
    res.json({ ok: true, message: 'Vehicle updated.' });
  }),
);

router.delete(
  '/vehicles/:id',
  asyncHandler(async (req, res) => {
    const result = run('DELETE FROM vehicles WHERE id = ? AND user_id = ?', [
      req.params.id,
      req.user.id,
    ]);
    if (result.changes === 0) throw notFound('That vehicle is not in your profile.');
    res.json({ ok: true, message: 'Vehicle removed.' });
  }),
);

/* -------------------------------------------------------------------- saved */

router.get(
  '/saved',
  asyncHandler(async (req, res) => {
    const rows = all(
      `SELECT l.* FROM saved_listings s JOIN listings l ON l.id = s.listing_id
       WHERE s.user_id = ? AND l.status = 'approved' ORDER BY s.created_at DESC`,
      [req.user.id],
    );
    res.json({ saved: serializeListings(rows, { viewer: req.user }) });
  }),
);

router.post(
  '/saved/:listingId',
  asyncHandler(async (req, res) => {
    const listing = one("SELECT id FROM listings WHERE id = ? AND status = 'approved'", [
      req.params.listingId,
    ]);
    if (!listing) throw notFound('That charger could not be found.');
    run(
      'INSERT INTO saved_listings (user_id, listing_id, created_at) VALUES (?,?,?) ON CONFLICT DO NOTHING',
      [req.user.id, listing.id, nowIso()],
    );
    res.status(201).json({ ok: true });
  }),
);

router.delete(
  '/saved/:listingId',
  asyncHandler(async (req, res) => {
    run('DELETE FROM saved_listings WHERE user_id = ? AND listing_id = ?', [
      req.user.id,
      req.params.listingId,
    ]);
    res.json({ ok: true });
  }),
);

/* ------------------------------------------------------------ notifications */

router.get(
  '/notifications',
  asyncHandler(async (req, res) => {
    const rows = all(
      'SELECT * FROM notifications WHERE user_id = ? ORDER BY created_at DESC LIMIT 40',
      [req.user.id],
    );
    res.json({
      notifications: rows.map((row) => ({
        id: row.id,
        kind: row.kind,
        title: row.title,
        body: row.body,
        link: row.link,
        read: Boolean(row.read_at),
        createdAt: row.created_at,
      })),
      unread: rows.filter((row) => !row.read_at).length,
    });
  }),
);

router.post(
  '/notifications/read-all',
  asyncHandler(async (req, res) => {
    run('UPDATE notifications SET read_at = ? WHERE user_id = ? AND read_at IS NULL', [
      nowIso(),
      req.user.id,
    ]);
    res.json({ ok: true });
  }),
);

router.post(
  '/notifications/:id/read',
  asyncHandler(async (req, res) => {
    run('UPDATE notifications SET read_at = ? WHERE id = ? AND user_id = ?', [
      nowIso(),
      req.params.id,
      req.user.id,
    ]);
    res.json({ ok: true });
  }),
);

export default router;
