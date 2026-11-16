import crypto from 'node:crypto';
import { config } from '../config.js';
import { bookingRules, refundPercentForCancellation } from '../config/policies.js';
import { newId, nowIso, one, run, transaction } from '../db/index.js';
import { conflict, forbidden, notFound, unprocessable } from '../lib/errors.js';
import { audit } from '../lib/audit.js';
import { notify } from '../lib/notifications.js';
import { addMinutes, formatLocalDate, humanDuration } from '../lib/time.js';
import { slotsForDate } from './availability.js';
import { quote, validateDuration } from './pricing.js';

const round2 = (value) => Math.round((value + Number.EPSILON) * 100) / 100;

const makeRef = () =>
  `CN-${Date.now().toString(36).toUpperCase().slice(-5)}${crypto
    .randomBytes(2)
    .toString('hex')
    .toUpperCase()}`;

const makeCheckinCode = () => String(crypto.randomInt(100000, 1000000));

export function createBooking({ user, listingId, startAt, durationMin, vehicleId = null, ip }) {
  const listing = one('SELECT * FROM listings WHERE id = ?', [listingId]);
  if (!listing) throw notFound('That charger could not be found.');
  if (listing.host_id === user.id) {
    throw forbidden('You cannot book your own charger.');
  }
  if (listing.status !== 'approved') {
    throw conflict('This charger is not open for booking right now.');
  }

  const durationError = validateDuration(listing, durationMin);
  if (durationError) throw unprocessable(durationError, [{ field: 'durationMin', message: durationError }]);

  const start = new Date(startAt);
  if (Number.isNaN(start.getTime())) {
    throw unprocessable('Choose a start time for your session.', [
      { field: 'startAt', message: 'Choose a start time.' },
    ]);
  }

  const timezone = listing.timezone || config.defaultTimezone;
  const localDate = formatLocalDate(start, timezone);

  const { slots } = slotsForDate({ listing, date: localDate, durationMin });
  const match = slots.find(
    (slot) => Math.abs(new Date(slot.startAt).getTime() - start.getTime()) < 60_000,
  );
  if (!match) {
    throw conflict('That start time is no longer available for this charger. Pick another slot.', [
      { field: 'startAt', message: 'This slot is unavailable.' },
    ]);
  }

  if (vehicleId) {
    const vehicle = one('SELECT * FROM vehicles WHERE id = ? AND user_id = ?', [vehicleId, user.id]);
    if (!vehicle) throw notFound('That vehicle is not in your profile anymore.');
    if (vehicle.connector !== listing.connector) {
      throw unprocessable(
        `Your vehicle uses a ${vehicle.connector} connector but this charger offers ${listing.connector}.`,
        [{ field: 'vehicleId', message: 'Connector mismatch.' }],
      );
    }
  }

  const price = quote({ pricePerHour: listing.price_per_hour, durationMin });
  const end = addMinutes(start, durationMin);
  const now = nowIso();
  const bookingId = newId();
  const ref = makeRef();
  const checkinCode = makeCheckinCode();

  const booking = transaction(() => {
    // Re-check inside the write transaction: this is what stops two drivers
    // grabbing the same exclusive slot at the same moment.
    const clash = one(
      `SELECT id FROM bookings
       WHERE listing_id = ? AND status IN ('CONFIRMED','IN_PROGRESS')
         AND start_at < ? AND end_at > ? LIMIT 1`,
      [listing.id, end.toISOString(), start.toISOString()],
    );
    if (clash) {
      throw conflict('Another driver just booked that slot. Please choose a different time.', [
        { field: 'startAt', message: 'This slot is unavailable.' },
      ]);
    }

    run(
      `INSERT INTO bookings (
         id, ref, listing_id, driver_id, host_id, vehicle_id, start_at, end_at, duration_min,
         status, subtotal, fee, total, currency, checkin_code, price_snapshot, created_at, updated_at
       ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      [
        bookingId,
        ref,
        listing.id,
        user.id,
        listing.host_id,
        vehicleId,
        start.toISOString(),
        end.toISOString(),
        durationMin,
        'CONFIRMED',
        price.subtotal,
        price.fee,
        price.total,
        price.currency,
        checkinCode,
        JSON.stringify({ ...price, hourlyRateAtBooking: price.hourlyRate }),
        now,
        now,
      ],
    );

    run(
      `INSERT INTO payments (id, booking_id, provider, reference, amount, currency, status, mode, created_at, updated_at)
       VALUES (?,?,?,?,?,?,?,?,?,?)`,
      [
        newId(),
        bookingId,
        config.paymentsMode === 'offline' ? 'offline' : 'unconfigured',
        null,
        price.total,
        price.currency,
        config.paymentsMode === 'offline' ? 'DUE_AT_SESSION' : 'PENDING',
        config.paymentsMode,
        now,
        now,
      ],
    );

    return one('SELECT * FROM bookings WHERE id = ?', [bookingId]);
  });

  notify(listing.host_id, {
    kind: 'booking_created',
    title: 'New booking confirmed',
    body: `${user.name || 'A driver'} booked ${humanDuration(durationMin)} at ${listing.title} on ${localDate}.`,
    link: `/host/bookings`,
  });
  notify(user.id, {
    kind: 'booking_created',
    title: 'Your charging session is booked',
    body: `${listing.title} · ${localDate} · ${humanDuration(durationMin)}. Reference ${ref}.`,
    link: `/bookings/${ref}`,
  });

  audit({
    actorId: user.id,
    action: 'booking.created',
    entityType: 'booking',
    entityId: bookingId,
    meta: { ref, listingId: listing.id, total: price.total },
    ip,
  });

  return booking;
}

export function loadBookingByRef(ref) {
  return one('SELECT * FROM bookings WHERE ref = ?', [ref]) ?? one('SELECT * FROM bookings WHERE id = ?', [ref]);
}

export function cancelBooking({ booking, user, reason, ip }) {
  if (!['CONFIRMED', 'IN_PROGRESS'].includes(booking.status)) {
    throw conflict('This booking can no longer be cancelled.');
  }

  const isHost = booking.host_id === user.id;
  const isDriver = booking.driver_id === user.id;
  const isAdmin = user.roles?.includes('admin');
  if (!isHost && !isDriver && !isAdmin) throw forbidden();

  const minutesBefore = (new Date(booking.start_at).getTime() - Date.now()) / 60_000;
  const by = isHost ? 'host' : isDriver ? 'driver' : 'system';
  const percent =
    by === 'host' || isAdmin
      ? 100
      : refundPercentForCancellation(Math.max(minutesBefore, 0));

  const payment = one('SELECT * FROM payments WHERE booking_id = ?', [booking.id]);
  const collected = payment && payment.status === 'PAID';
  const refundAmount = collected ? round2((booking.total * percent) / 100) : 0;
  const now = nowIso();

  transaction(() => {
    run(
      `UPDATE bookings SET status = 'CANCELLED', cancelled_by = ?, cancel_reason = ?,
         refund_percent = ?, refund_amount = ?, updated_at = ? WHERE id = ?`,
      [by, reason ?? null, percent, refundAmount, now, booking.id],
    );
    if (payment) {
      const nextStatus = collected
        ? refundAmount > 0
          ? 'REFUND_PENDING'
          : 'PAID'
        : payment.status === 'DUE_AT_SESSION'
          ? 'CANCELLED'
          : payment.status;
      run('UPDATE payments SET status = ?, updated_at = ? WHERE id = ?', [
        nextStatus,
        now,
        payment.id,
      ]);
    }
  });

  const counterpart = isHost ? booking.driver_id : booking.host_id;
  notify(counterpart, {
    kind: 'booking_cancelled',
    title: 'A booking was cancelled',
    body: `${by === 'host' ? 'The host' : 'The driver'} cancelled booking ${booking.ref}.`,
    link: `/bookings/${booking.ref}`,
  });

  audit({
    actorId: user.id,
    action: 'booking.cancelled',
    entityType: 'booking',
    entityId: booking.id,
    meta: { by, percent, refundAmount, reason },
    ip,
  });

  return { percent, refundAmount };
}

export function cancelWindowFor(booking, now = new Date()) {
  const minutesBefore = (new Date(booking.start_at).getTime() - now.getTime()) / 60_000;
  return {
    minutesBefore: Math.round(minutesBefore),
    refundPercent: refundPercentForCancellation(Math.max(minutesBefore, 0)),
    gracePeriodMinutes: bookingRules.gracePeriodMinutes,
  };
}
