import express from 'express';
import { z } from 'zod';
import { all, newId, nowIso, one, run } from '../db/index.js';
import { requireAuth } from '../lib/auth.js';
import { notFound } from '../lib/errors.js';
import { asyncHandler, parse } from '../lib/validate.js';
import { audit } from '../lib/audit.js';
import { writeLimiter } from '../middleware/guards.js';

const router = express.Router();

const CATEGORIES = [
  'Unsafe charger or wiring',
  'Charger not available',
  'Listing inaccurate',
  'Address or access problem',
  'Unfair treatment',
  'Payment or refund issue',
  'No-show',
  'Other',
];

const reportSchema = z.object({
  targetType: z.enum(['listing', 'booking', 'user', 'other']),
  targetId: z.string().uuid().nullish(),
  category: z.enum(CATEGORIES, { errorMap: () => ({ message: 'Pick a category.' }) }),
  details: z
    .string()
    .trim()
    .min(20, 'Please describe what happened in at least a couple of sentences.')
    .max(2000),
});

router.post(
  '/',
  requireAuth,
  writeLimiter,
  asyncHandler(async (req, res) => {
    const data = parse(reportSchema, req.body);

    if (data.targetType === 'listing' && data.targetId) {
      if (!one('SELECT 1 AS hit FROM listings WHERE id = ?', [data.targetId])) {
        throw notFound('That listing no longer exists.');
      }
    }
    if (data.targetType === 'booking' && data.targetId) {
      const booking = one('SELECT * FROM bookings WHERE id = ?', [data.targetId]);
      if (!booking) throw notFound('That booking could not be found.');
      if (booking.driver_id !== req.user.id && booking.host_id !== req.user.id) {
        throw notFound('That booking could not be found on your account.');
      }
    }

    const id = newId();
    run(
      `INSERT INTO reports (id, reporter_id, target_type, target_id, category, details, status, created_at, updated_at)
       VALUES (?,?,?,?,?,?, 'OPEN', ?, ?)`,
      [
        id,
        req.user.id,
        data.targetType,
        data.targetId ?? null,
        data.category,
        data.details,
        nowIso(),
        nowIso(),
      ],
    );

    audit({
      actorId: req.user.id,
      action: 'report.created',
      entityType: 'report',
      entityId: id,
      meta: { category: data.category, targetType: data.targetType, targetId: data.targetId ?? null },
      ip: req.ip,
    });

    res.status(201).json({
      id,
      message: 'Report received. Support will review it and follow up on your booking page.',
      categories: CATEGORIES,
    });
  }),
);

router.get(
  '/me',
  requireAuth,
  asyncHandler(async (req, res) => {
    const rows = all(
      'SELECT * FROM reports WHERE reporter_id = ? ORDER BY created_at DESC LIMIT 50',
      [req.user.id],
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
        createdAt: row.created_at,
        updatedAt: row.updated_at,
      })),
    });
  }),
);

router.get('/categories', (_req, res) => res.json({ categories: CATEGORIES }));

export default router;
