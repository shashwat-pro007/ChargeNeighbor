import { config } from '../config.js';

const round2 = (value) => Math.round((value + Number.EPSILON) * 100) / 100;

/**
 * Server-side price quote. The client never sends a price; it is always
 * recomputed here from the listing's stored hourly rate.
 */
export function quote({ pricePerHour, durationMin }) {
  const subtotal = round2((Number(pricePerHour) * Number(durationMin)) / 60);
  const fee = round2((subtotal * config.platformFeePercent) / 100);
  const total = round2(subtotal + fee);
  return {
    currency: config.currency,
    durationMin,
    hourlyRate: round2(Number(pricePerHour)),
    subtotal,
    fee,
    feePercent: config.platformFeePercent,
    total,
    hostEarning: subtotal,
    paymentMode: config.paymentsMode,
  };
}

export function validateDuration(listing, durationMin) {
  if (!Number.isFinite(durationMin)) {
    return 'Choose a session length.';
  }
  if (durationMin < listing.min_duration_min) {
    return `The shortest session for this charger is ${listing.min_duration_min} minutes.`;
  }
  if (durationMin > listing.max_duration_min) {
    return `The longest session for this charger is ${listing.max_duration_min} minutes.`;
  }
  if (durationMin % 15 !== 0) {
    return 'Session length must be in 15 minute steps.';
  }
  return null;
}
