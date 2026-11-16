import { all } from '../db/index.js';
import { addMinutes, parseClock, parseLocalDate, zonedParts, zonedToUtc, formatLocalDate } from '../lib/time.js';
import { bookingRules } from '../config/policies.js';
import { config } from '../config.js';

const BLOCKING_STATUSES = ['CONFIRMED', 'IN_PROGRESS'];

export function bookingsForRange(listingId, fromIso, toIso) {
  return all(
    `SELECT id, start_at, end_at, status FROM bookings
     WHERE listing_id = ? AND status IN (${BLOCKING_STATUSES.map(() => '?').join(',')})
       AND start_at < ? AND end_at > ?
     ORDER BY start_at ASC`,
    [listingId, ...BLOCKING_STATUSES, toIso, fromIso],
  );
}

const overlaps = (aStart, aEnd, bStart, bEnd) => aStart < bEnd && bStart < aEnd;

export function slotIsFree(listingId, startIso, endIso) {
  const clash = all(
    `SELECT id FROM bookings
     WHERE listing_id = ? AND status IN (${BLOCKING_STATUSES.map(() => '?').join(',')})
       AND start_at < ? AND end_at > ?
     LIMIT 1`,
    [listingId, ...BLOCKING_STATUSES, endIso, startIso],
  );
  return clash.length === 0;
}

/**
 * Generates bookable start times for one local date, from the host's weekly
 * availability minus confirmed sessions, blocked dates and the minimum lead
 * time. Slots are returned as UTC instants; the listing timezone was used to
 * interpret the host's rules.
 */
export function slotsForDate({ listing, date, durationMin, now = new Date(), limit = 200 }) {
  const parsed = parseLocalDate(date);
  if (!parsed) return { slots: [], blocked: false, reason: 'INVALID_DATE' };

  const timezone = listing.timezone || config.defaultTimezone;
  const dayStart = zonedToUtc({ ...parsed, hour: 0, minute: 0 }, timezone);
  const weekday = zonedParts(dayStart, timezone).weekday;

  const exception = all(
    'SELECT * FROM availability_exceptions WHERE listing_id = ? AND date = ?',
    [listing.id, date],
  )[0];

  if (exception?.is_blocked) {
    return { slots: [], blocked: true, reason: 'BLOCKED_DATE', weekday };
  }
  if (listing.status !== 'approved') {
    return { slots: [], blocked: true, reason: 'LISTING_NOT_AVAILABLE', weekday };
  }

  const rules = all(
    'SELECT * FROM availability_rules WHERE listing_id = ? AND weekday = ? ORDER BY start_time',
    [listing.id, weekday],
  );
  if (rules.length === 0) {
    return { slots: [], blocked: false, reason: 'NO_AVAILABILITY', weekday };
  }

  const earliest = addMinutes(now, config.minLeadMinutes);
  const horizon = addMinutes(now, bookingRules.maxAdvanceDays * 24 * 60);
  const taken = bookingsForRange(
    listing.id,
    dayStart.toISOString(),
    addMinutes(dayStart, 24 * 60).toISOString(),
  );

  const step = config.slotStepMinutes;
  const slots = [];

  for (const rule of rules) {
    const startMinutes = parseClock(rule.start_time);
    const endMinutes = parseClock(rule.end_time);
    if (startMinutes === null || endMinutes === null) continue;

    for (let cursor = startMinutes; cursor + durationMin <= endMinutes; cursor += step) {
      const start = zonedToUtc(
        { ...parsed, hour: Math.floor(cursor / 60), minute: cursor % 60 },
        timezone,
      );
      const end = addMinutes(start, durationMin);

      if (start < earliest) continue;
      if (start > horizon) continue;

      const clash = taken.some((booking) =>
        overlaps(start.toISOString(), end.toISOString(), booking.start_at, booking.end_at),
      );
      if (clash) continue;

      slots.push({
        startAt: start.toISOString(),
        endAt: end.toISOString(),
        localStart: `${date}T${String(Math.floor(cursor / 60)).padStart(2, '0')}:${String(
          cursor % 60,
        ).padStart(2, '0')}`,
      });

      if (slots.length >= limit) return { slots, blocked: false, weekday, timezone };
    }
  }

  return { slots, blocked: false, weekday, timezone };
}

/** Next N dates that have at least one free slot, used for the detail page. */
export function upcomingDays({ listing, durationMin, days = 7, now = new Date() }) {
  const timezone = listing.timezone || config.defaultTimezone;
  const out = [];
  for (let offset = 0; offset < days; offset += 1) {
    const date = formatLocalDate(addMinutes(now, offset * 24 * 60), timezone);
    const result = slotsForDate({ listing, date, durationMin, now });
    out.push({ date, slotCount: result.slots.length, reason: result.reason ?? null });
  }
  return out;
}
