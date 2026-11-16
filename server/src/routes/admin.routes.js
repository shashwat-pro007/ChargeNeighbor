import express from 'express';
import { z } from 'zod';
import { config } from '../config.js';
import { all, nowIso, one, run } from '../db/index.js';
import { requireAuth, requireRole } from '../lib/auth.js';
import { conflict, notFound } from '../lib/errors.js';
import { asyncHandler, parse } from '../lib/validate.js';
import { audit } from '../lib/audit.js';
import { notify } from '../lib/notifications.js';
import { serializeBooking } from '../services/serializers.js';

const router = express.Router();
router.use(requireAuth, requireRole('admin'));

router.get(
  '/summary',
  asyncHandler(async (_req, res) => {
    const counts = one(
      `SELECT
        (SELECT COUNT(*) FROM users WHERE status = 'active') AS users,
        (SELECT COUNT(*) FROM listings WHERE status = 'approved') AS live_listings,
        (SELECT COUNT(*) FROM listings WHERE status = 'pending') AS pending_listings,
        (SELECT COUNT(*) FROM bookings) AS bookings,
        (SELECT COUNT(*) FROM bookings WHERE status IN ('CONFIRMED','IN_PROGRESS')) AS active_bookings,
        (SELECT COUNT(*) FROM reports WHERE status != 'RESOLVED') AS open_reports,
        (SELECT COALESCE(SUM(total), 0) FROM bookings WHERE status IN ('CONFIRMED','IN_PROGRESS','COMPLETED')) AS booking_value`,
    );
    res.json({ metrics: counts, currency: config.currency });
  }),
);

router.get(
  '/review-queue',
  asyncHandler(async (req, res) => {
    const status = String(req.query.status ?? 'pending');
    const rows = all(
      `SELECT l.*, u.name AS host_name, u.phone AS host_phone FROM listings l
       JOIN users u ON u.id = l.host_id
       WHERE l.status = ? ORDER BY l.updated_at ASC LIMIT 100`,
      [status],
    );
    const photos = all(
      `SELECT * FROM listing_photos WHERE listing_id IN (${rows.map(() => '?').join(',') || "''"})`,
      rows.map((row) => row.id),
    );
    res.json({
      listings: rows.map((row) => ({
        id: row.id,
        title: row.title,
        description: row.description,
        area: row.area,
        city: row.city,
        addressLine: row.address_line,
        connector: row.connector,
        powerKw: row.power_kw,
        currentType: row.current_type,
        pricePerHour: row.price_per_hour,
        status: row.status,
        host: { id: row.host_id, name: row.host_name, phone: row.host_phone },
        photos: photos.filter((photo) => photo.listing_id === row.id).map((photo) => photo.url),
        submittedAt: row.updated_at,
      })),
      status,
    });
  }),
);

router.post(
  '/listings/:id/review',
  asyncHandler(async (req, res) => {
    const { decision, reason } = parse(
      z.object({
        decision: z.enum(['approve', 'reject']),
        reason: z.string().trim().max(400).optional(),
      }),
      req.body,
    );
    if (decision === 'reject' && !reason) {
      throw conflict('Tell the host why the listing was rejected.');
    }

    const listing = one('SELECT * FROM listings WHERE id = ?', [req.params.id]);
    if (!listing) throw notFound('That listing could not be found.');
    if (listing.status !== 'pending') {
      throw conflict(`Only listings waiting for review can be decided (this one is ${listing.status}).`);
    }

    const nextStatus = decision === 'approve' ? 'approved' : 'rejected';
    run(
      'UPDATE listings SET status = ?, rejection_reason = ?, reviewed_by = ?, reviewed_at = ?, updated_at = ? WHERE id = ?',
      [nextStatus, decision === 'reject' ? reason : null, req.user.id, nowIso(), nowIso(), listing.id],
    );

    notify(listing.host_id, {
      kind: 'listing_reviewed',
      title: decision === 'approve' ? 'Your charger is live' : 'Your listing needs changes',
      body:
        decision === 'approve'
          ? `${listing.title} is approved and now appears in search.`
          : `${listing.title} was not approved: ${reason}`,
      link: '/host/listings',
    });

    audit({
      actorId: req.user.id,
      action: `listing.${decision}`,
      entityType: 'listing',
      entityId: listing.id,
      meta: { reason: reason ?? null },
      ip: req.ip,
    });

    res.json({ ok: true, status: nextStatus });
  }),
);

router.get(
  '/reports',
  asyncHandler(async (req, res) => {
    const status = req.query.status ? String(req.query.status) : null;
    const rows = all(
      `SELECT r.*, u.name AS reporter_name, u.phone AS reporter_phone FROM reports r
       JOIN users u ON u.id = r.reporter_id
       ${status ? 'WHERE r.status = ?' : ''}
       ORDER BY r.created_at DESC LIMIT 100`,
      status ? [status] : [],
    );
    res.json({
      reports: rows.map((row) => ({
        id: row.id,
        targetType: row.target_type,
        targetId: row.target_id,
        category: row.category,
        details: row.details,
        status: row.status,
        resolution: row.resolution,
        reporter: { name: row.reporter_name, phone: row.reporter_phone },
        createdAt: row.created_at,
      })),
    });
  }),
);

router.post(
  '/reports/:id/resolve',
  asyncHandler(async (req, res) => {
    const { status, resolution } = parse(
      z.object({
        status: z.enum(['OPEN', 'REVIEWING', 'RESOLVED']),
        resolution: z.string().trim().max(600).optional(),
      }),
      req.body,
    );
    const report = one('SELECT * FROM reports WHERE id = ?', [req.params.id]);
    if (!report) throw notFound('That report could not be found.');

    run('UPDATE reports SET status = ?, resolution = ?, resolved_by = ?, updated_at = ? WHERE id = ?', [
      status,
      resolution ?? report.resolution,
      status === 'RESOLVED' ? req.user.id : null,
      nowIso(),
      report.id,
    ]);

    if (status === 'RESOLVED') {
      notify(report.reporter_id, {
        kind: 'report_resolved',
        title: 'Your report was reviewed',
        body: resolution ?? 'Support has closed this case.',
        link: '/help',
      });
    }

    audit({
      actorId: req.user.id,
      action: 'report.updated',
      entityType: 'report',
      entityId: report.id,
      meta: { status, resolution: resolution ?? null },
      ip: req.ip,
    });

    res.json({ ok: true });
  }),
);

router.get(
  '/bookings',
  asyncHandler(async (req, res) => {
    const q = String(req.query.q ?? '').trim();
    const rows = all(
      `SELECT * FROM bookings
       ${q ? 'WHERE ref LIKE ? OR listing_id LIKE ?' : ''}
       ORDER BY created_at DESC LIMIT 50`,
      q ? [`%${q}%`, `%${q}%`] : [],
    );
    res.json({ bookings: rows.map((row) => serializeBooking(row, { viewerId: req.user.id, includePrivate: true })) });
  }),
);

router.get(
  '/users',
  asyncHandler(async (req, res) => {
    const q = String(req.query.q ?? '').trim();
    const rows = all(
      `SELECT u.*, h.verification FROM users u
       LEFT JOIN host_profiles h ON h.user_id = u.id
       ${q ? 'WHERE u.phone LIKE ? OR u.name LIKE ?' : ''}
       ORDER BY u.created_at DESC LIMIT 50`,
      q ? [`%${q}%`, `%${q}%`] : [],
    );
    res.json({
      users: rows.map((row) => ({
        id: row.id,
        phone: row.phone,
        name: row.name,
        roles: String(row.roles).split(','),
        status: row.status,
        verification: row.verification ?? 'none',
        phoneVerified: Boolean(row.phone_verified_at),
        createdAt: row.created_at,
      })),
    });
  }),
);

router.post(
  '/users/:id/status',
  asyncHandler(async (req, res) => {
    const { status, reason } = parse(
      z.object({
        status: z.enum(['active', 'suspended']),
        reason: z.string().trim().max(400).optional(),
      }),
      req.body,
    );
    const user = one('SELECT * FROM users WHERE id = ?', [req.params.id]);
    if (!user) throw notFound('That account could not be found.');
    if (user.id === req.user.id) throw conflict('You cannot change the status of your own account.');

    run('UPDATE users SET status = ?, updated_at = ? WHERE id = ?', [status, nowIso(), user.id]);
    if (status === 'suspended') {
      run("UPDATE listings SET status = 'paused', updated_at = ? WHERE host_id = ?", [nowIso(), user.id]);
    }
    notify(user.id, {
      kind: 'account_status',
      title: status === 'suspended' ? 'Your account has been suspended' : 'Your account is active again',
      body: reason ?? null,
      link: '/help',
    });
    audit({
      actorId: req.user.id,
      action: 'user.status_changed',
      entityType: 'user',
      entityId: user.id,
      meta: { status, reason: reason ?? null },
      ip: req.ip,
    });
    res.json({ ok: true });
  }),
);

export default router;
