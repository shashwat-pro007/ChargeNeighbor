import express from 'express';
import { z } from 'zod';
import { all, newId, nowIso, one, run } from '../db/index.js';
import { canSeePrivateAddress, isAdmin, requireAuth } from '../lib/auth.js';
import { conflict, forbidden, notFound } from '../lib/errors.js';
import { asyncHandler, parse } from '../lib/validate.js';
import { audit } from '../lib/audit.js';
import { notify } from '../lib/notifications.js';
import { serializeBooking } from '../services/serializers.js';
import {
  cancelBooking,
  cancelWindowFor,
  createBooking,
  loadBookingByRef,
} from '../services/bookings.js';
import { writeLimiter } from '../middleware/guards.js';

const router = express.Router();

const createSchema = z.object({
  listingId: z.string().uuid('Choose a charger to book.'),
  startAt: z.string().min(10, 'Choose a start time.'),
  durationMin: z.coerce.number().int().min(15).max(720),
  vehicleId: z.string().uuid().nullish(),
});

router.post(
  '/',
  requireAuth,
  writeLimiter,
  asyncHandler(async (req, res) => {
    const input = parse(createSchema, req.body);
    const booking = createBooking({
      user: req.user,
      listingId: input.listingId,
      startAt: input.startAt,
      durationMin: input.durationMin,
      vehicleId: input.vehicleId ?? null,
      ip: req.ip,
    });

    res.status(201).json({
      booking: serializeBooking(booking, { viewerId: req.user.id, includePrivate: true }),
      message: 'Your charging session is booked.',
    });
  }),
);

router.get(
  '/me',
  requireAuth,
  asyncHandler(async (req, res) => {
    const scope = String(req.query.scope ?? 'all');
    const role = String(req.query.role ?? 'driver');

    const column = role === 'host' ? 'host_id' : 'driver_id';
    const rows = all(
      `SELECT * FROM bookings WHERE ${column} = ? ORDER BY start_at DESC LIMIT 200`,
      [req.user.id],
    );

    const now = Date.now();
    const filtered = rows.filter((row) => {
      const startsAt = new Date(row.start_at).getTime();
      if (scope === 'upcoming') {
        return startsAt >= now - 60 * 60 * 1000 && ['CONFIRMED', 'IN_PROGRESS'].includes(row.status);
      }
      if (scope === 'past') {
        return startsAt < now - 60 * 60 * 1000 || ['COMPLETED', 'CANCELLED', 'NO_SHOW'].includes(row.status);
      }
      return true;
    });

    res.json({
      bookings: filtered.map((row) =>
        serializeBooking(row, {
          viewerId: req.user.id,
          includePrivate:
            role === 'host' ? true : canSeePrivateAddress(row, req.user),
        }),
      ),
      total: filtered.length,
    });
  }),
);

router.get(
  '/:ref',
  requireAuth,
  asyncHandler(async (req, res) => {
    const booking = loadBookingByRef(req.params.ref);
    if (!booking) throw notFound('That booking could not be found.');

    const allowed =
      booking.driver_id === req.user.id || booking.host_id === req.user.id || isAdmin(req.user);
    if (!allowed) throw forbidden('You do not have access to this booking.');

    res.json({
      booking: serializeBooking(booking, {
        viewerId: req.user.id,
        includePrivate: canSeePrivateAddress(booking, req.user),
      }),
      cancellation: cancelWindowFor(booking),
    });
  }),
);

router.post(
  '/:ref/cancel',
  requireAuth,
  writeLimiter,
  asyncHandler(async (req, res) => {
    const { reason } = parse(
      z.object({ reason: z.string().trim().max(300).optional() }),
      req.body ?? {},
    );
    const booking = loadBookingByRef(req.params.ref);
    if (!booking) throw notFound('That booking could not be found.');

    const outcome = cancelBooking({ booking, user: req.user, reason, ip: req.ip });
    const fresh = one('SELECT * FROM bookings WHERE id = ?', [booking.id]);

    res.json({
      booking: serializeBooking(fresh, { viewerId: req.user.id, includePrivate: true }),
      outcome,
      message:
        outcome.refundAmount > 0
          ? `Booking cancelled. A refund of ${outcome.refundAmount} has been recorded.`
          : 'Booking cancelled. No refund applies under the cancellation policy.',
    });
  }),
);

router.post(
  '/:ref/checkin',
  requireAuth,
  writeLimiter,
  asyncHandler(async (req, res) => {
    const { code } = parse(
      z.object({ code: z.string().trim().regex(/^\d{6}$/, 'The check-in code is 6 digits.') }),
      req.body,
    );
    const booking = loadBookingByRef(req.params.ref);
    if (!booking) throw notFound('That booking could not be found.');
    if (booking.driver_id !== req.user.id) {
      throw forbidden('Only the driver on this booking can check in.');
    }
    if (booking.status !== 'CONFIRMED') {
      throw conflict('This booking is not in a state that can be checked in.');
    }

    const earliest = new Date(booking.start_at).getTime() - 30 * 60 * 1000;
    if (Date.now() < earliest) {
      throw conflict('Check-in opens 30 minutes before your session starts.');
    }
    if (code !== booking.checkin_code) {
      throw conflict('That check-in code does not match this booking.');
    }

    const now = nowIso();
    run("UPDATE bookings SET status = 'IN_PROGRESS', checked_in_at = ?, updated_at = ? WHERE id = ?", [
      now,
      now,
      booking.id,
    ]);
    notify(booking.host_id, {
      kind: 'booking_checked_in',
      title: 'Driver checked in',
      body: `Booking ${booking.ref} has started.`,
      link: '/host/bookings',
    });
    audit({ actorId: req.user.id, action: 'booking.checked_in', entityType: 'booking', entityId: booking.id, ip: req.ip });

    const fresh = one('SELECT * FROM bookings WHERE id = ?', [booking.id]);
    res.json({ booking: serializeBooking(fresh, { viewerId: req.user.id, includePrivate: true }) });
  }),
);

router.post(
  '/:ref/complete',
  requireAuth,
  writeLimiter,
  asyncHandler(async (req, res) => {
    const booking = loadBookingByRef(req.params.ref);
    if (!booking) throw notFound('That booking could not be found.');

    const isParty = booking.driver_id === req.user.id || booking.host_id === req.user.id;
    if (!isParty && !isAdmin(req.user)) throw forbidden();
    if (!['CONFIRMED', 'IN_PROGRESS'].includes(booking.status)) {
      throw conflict('This booking cannot be completed from its current state.');
    }

    const now = nowIso();
    run("UPDATE bookings SET status = 'COMPLETED', completed_at = ?, updated_at = ? WHERE id = ?", [
      now,
      now,
      booking.id,
    ]);
    const payment = one('SELECT * FROM payments WHERE booking_id = ?', [booking.id]);
    if (payment && payment.status === 'DUE_AT_SESSION') {
      run("UPDATE payments SET status = 'PAID', updated_at = ? WHERE id = ?", [now, payment.id]);
    }

    for (const userId of [booking.driver_id, booking.host_id]) {
      notify(userId, {
        kind: 'booking_completed',
        title: 'Charging session completed',
        body: `Booking ${booking.ref} is complete. You can now leave a review.`,
        link: `/bookings/${booking.ref}`,
      });
    }
    audit({ actorId: req.user.id, action: 'booking.completed', entityType: 'booking', entityId: booking.id, ip: req.ip });

    const fresh = one('SELECT * FROM bookings WHERE id = ?', [booking.id]);
    res.json({ booking: serializeBooking(fresh, { viewerId: req.user.id, includePrivate: true }) });
  }),
);

router.post(
  '/:ref/no-show',
  requireAuth,
  writeLimiter,
  asyncHandler(async (req, res) => {
    const booking = loadBookingByRef(req.params.ref);
    if (!booking) throw notFound('That booking could not be found.');
    if (booking.host_id !== req.user.id) throw forbidden('Only the host can mark a no-show.');
    if (booking.status !== 'CONFIRMED') {
      throw conflict('Only a confirmed booking can be marked as a no-show.');
    }
    const graceMs = 30 * 60 * 1000;
    if (Date.now() < new Date(booking.start_at).getTime() + graceMs) {
      throw conflict('You can mark a no-show 30 minutes after the session was due to start.');
    }

    const now = nowIso();
    run("UPDATE bookings SET status = 'NO_SHOW', refund_percent = 0, updated_at = ? WHERE id = ?", [
      now,
      booking.id,
    ]);
    notify(booking.driver_id, {
      kind: 'booking_no_show',
      title: 'Booking marked as no-show',
      body: `The host marked ${booking.ref} as a no-show.`,
      link: `/bookings/${booking.ref}`,
    });
    audit({ actorId: req.user.id, action: 'booking.no_show', entityType: 'booking', entityId: booking.id, ip: req.ip });

    res.json({ ok: true });
  }),
);

router.post(
  '/:ref/review',
  requireAuth,
  writeLimiter,
  asyncHandler(async (req, res) => {
    const { rating, comment } = parse(
      z.object({
        rating: z.coerce.number().int().min(1).max(5),
        comment: z.string().trim().max(1000).optional(),
      }),
      req.body,
    );

    const booking = loadBookingByRef(req.params.ref);
    if (!booking) throw notFound('That booking could not be found.');
    if (booking.driver_id !== req.user.id) throw forbidden('Only the driver can review a session.');
    if (booking.status !== 'COMPLETED') {
      throw conflict('You can review a session once it is completed.');
    }
    if (one('SELECT 1 AS hit FROM reviews WHERE booking_id = ?', [booking.id])) {
      throw conflict('You have already reviewed this session.');
    }

    run(
      `INSERT INTO reviews (id, booking_id, listing_id, author_id, rating, comment, status, created_at)
       VALUES (?,?,?,?,?,?, 'published', ?)`,
      [newId(), booking.id, booking.listing_id, req.user.id, rating, comment ?? null, nowIso()],
    );

    res.status(201).json({ ok: true, message: 'Thanks for reviewing your session.' });
  }),
);

export default router;
