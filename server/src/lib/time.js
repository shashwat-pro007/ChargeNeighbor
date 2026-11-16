/**
 * Small timezone helper built on Intl, so availability windows stay in the
 * host's local time no matter where the server runs.
 */

const partsCache = new Map();

function formatterFor(timeZone) {
  if (!partsCache.has(timeZone)) {
    partsCache.set(
      timeZone,
      new Intl.DateTimeFormat('en-GB', {
        timeZone,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        weekday: 'short',
        hour12: false,
      }),
    );
  }
  return partsCache.get(timeZone);
}

const WEEKDAY_INDEX = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };

export function isValidTimeZone(timeZone) {
  try {
    formatterFor(timeZone).format(new Date());
    return true;
  } catch {
    return false;
  }
}

/** Wall-clock fields for a UTC instant in the given timezone. */
export function zonedParts(date, timeZone) {
  const parts = Object.fromEntries(
    formatterFor(timeZone)
      .formatToParts(date)
      .filter((part) => part.type !== 'literal')
      .map((part) => [part.type, part.value]),
  );
  return {
    year: Number(parts.year),
    month: Number(parts.month),
    day: Number(parts.day),
    hour: parts.hour === '24' ? 0 : Number(parts.hour),
    minute: Number(parts.minute),
    second: Number(parts.second),
    weekday: WEEKDAY_INDEX[parts.weekday] ?? 0,
  };
}

function offsetMs(date, timeZone) {
  const parts = zonedParts(date, timeZone);
  const asUtc = Date.UTC(
    parts.year,
    parts.month - 1,
    parts.day,
    parts.hour,
    parts.minute,
    parts.second,
  );
  return asUtc - Math.floor(date.getTime() / 1000) * 1000;
}

/** Convert a wall-clock time in a timezone into the matching UTC instant. */
export function zonedToUtc({ year, month, day, hour, minute }, timeZone) {
  const guess = Date.UTC(year, month - 1, day, hour, minute, 0);
  let instant = guess - offsetMs(new Date(guess), timeZone);
  instant = guess - offsetMs(new Date(instant), timeZone);
  return new Date(instant);
}

export function formatLocalDate(date, timeZone) {
  const p = zonedParts(date, timeZone);
  return `${p.year}-${String(p.month).padStart(2, '0')}-${String(p.day).padStart(2, '0')}`;
}

export function parseLocalDate(value) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(value ?? ''));
  if (!match) return null;
  const [, y, m, d] = match;
  const year = Number(y);
  const month = Number(m);
  const day = Number(d);
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  return { year, month, day };
}

/** 'HH:MM' -> minutes past midnight. Returns null for bad input. */
export function parseClock(value) {
  const match = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(String(value ?? ''));
  if (!match) return null;
  return Number(match[1]) * 60 + Number(match[2]);
}

export function minutesToClock(minutes) {
  const h = Math.floor(minutes / 60) % 24;
  const m = minutes % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

export const addMinutes = (date, minutes) => new Date(date.getTime() + minutes * 60_000);

export function humanDuration(minutes) {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h === 0) return `${m} min`;
  if (m === 0) return `${h} hr`;
  return `${h} hr ${m} min`;
}
