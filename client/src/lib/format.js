const DEFAULT_TZ = 'Asia/Kolkata';

export function money(amount, currency = 'INR', { compact = false } = {}) {
  if (amount === null || amount === undefined || Number.isNaN(Number(amount))) return '—';
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency,
    maximumFractionDigits: Number.isInteger(Number(amount)) ? 0 : 2,
    notation: compact ? 'compact' : 'standard',
  }).format(Number(amount));
}

export function dayTime(iso, timeZone = DEFAULT_TZ) {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('en-IN', {
    timeZone,
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });
}

export function dayOnly(iso, timeZone = DEFAULT_TZ) {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('en-IN', {
    timeZone,
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  });
}

export function timeOnly(iso, timeZone = DEFAULT_TZ) {
  if (!iso) return '—';
  return new Date(iso).toLocaleTimeString('en-IN', {
    timeZone,
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });
}

export function dateInputValue(date = new Date()) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function durationLabel(minutes) {
  const value = Number(minutes);
  if (!Number.isFinite(value)) return '—';
  const hours = Math.floor(value / 60);
  const mins = value % 60;
  if (hours === 0) return `${mins} min`;
  if (mins === 0) return `${hours} hr${hours > 1 ? 's' : ''}`;
  return `${hours} hr ${mins} min`;
}

export function relativeFromNow(iso) {
  if (!iso) return '';
  const diffMs = new Date(iso).getTime() - Date.now();
  const abs = Math.abs(diffMs);
  const minutes = Math.round(abs / 60000);
  if (minutes < 1) return 'now';
  const label =
    minutes < 60
      ? `${minutes} min`
      : minutes < 60 * 24
        ? `${Math.round(minutes / 60)} hr`
        : `${Math.round(minutes / (60 * 24))} day${Math.round(minutes / (60 * 24)) > 1 ? 's' : ''}`;
  return diffMs >= 0 ? `in ${label}` : `${label} ago`;
}

export function km(value) {
  if (value === null || value === undefined) return null;
  return `${Number(value).toFixed(Number(value) < 10 ? 1 : 0)} km`;
}

export const titleCase = (value) =>
  String(value ?? '')
    .replace(/_/g, ' ')
    .toLowerCase()
    .replace(/\b\w/g, (char) => char.toUpperCase());

export const bookingStatusTone = (status) =>
  ({
    CONFIRMED: 'success',
    IN_PROGRESS: 'info',
    COMPLETED: 'neutral',
    CANCELLED: 'danger',
    NO_SHOW: 'danger',
    DISPUTED: 'warn',
  })[status] ?? 'neutral';

export const listingStatusTone = (status) =>
  ({
    approved: 'success',
    pending: 'warn',
    draft: 'neutral',
    rejected: 'danger',
    paused: 'info',
  })[status] ?? 'neutral';
