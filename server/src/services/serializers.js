import { all, one, parseRoles } from '../db/index.js';
import { publicCoords, distanceKm, roundKm } from '../lib/geo.js';
import { cancellation } from '../config/policies.js';

const list = (value) =>
  String(value ?? '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);

const photosFor = (ids) => {
  if (ids.length === 0) return new Map();
  const rows = all(
    `SELECT * FROM listing_photos WHERE listing_id IN (${ids.map(() => '?').join(',')})
     ORDER BY sort_order ASC, created_at ASC`,
    ids,
  );
  const map = new Map();
  for (const row of rows) {
    if (!map.has(row.listing_id)) map.set(row.listing_id, []);
    map.get(row.listing_id).push({ id: row.id, url: row.url });
  }
  return map;
};

const ratingsFor = (ids) => {
  if (ids.length === 0) return new Map();
  const rows = all(
    `SELECT listing_id, COUNT(*) AS count, AVG(rating) AS average FROM reviews
     WHERE status = 'published' AND listing_id IN (${ids.map(() => '?').join(',')})
     GROUP BY listing_id`,
    ids,
  );
  return new Map(
    rows.map((row) => [
      row.listing_id,
      { count: row.count, average: Math.round(row.average * 10) / 10 },
    ]),
  );
};

const hostsFor = (hostIds) => {
  const ids = [...new Set(hostIds)];
  if (ids.length === 0) return new Map();
  const rows = all(
    `SELECT u.id, u.name, u.phone_verified_at, u.roles, u.created_at, h.display_name, h.verification
     FROM users u LEFT JOIN host_profiles h ON h.user_id = u.id
     WHERE u.id IN (${ids.map(() => '?').join(',')})`,
    ids,
  );
  return new Map(rows.map((row) => [row.id, row]));
};

export function serializeHostCard(row) {
  if (!row) return null;
  return {
    id: row.id,
    displayName: row.display_name || row.name || 'ChargeNeighbor host',
    phoneVerified: Boolean(row.phone_verified_at),
    verification: row.verification || 'none',
    memberSince: row.created_at,
    isHost: parseRoles(row.roles).includes('host'),
  };
}

/** Public-safe listing. Never contains the street address or access notes. */
export function serializeListing(row, ctx = {}) {
  const coords = publicCoords(row);
  const viewer = ctx.viewer;
  const distance = ctx.origin ? distanceKm(ctx.origin, coords) : null;
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    area: row.area,
    city: row.city,
    location: { lat: coords.lat, lng: coords.lng, approximate: true },
    distanceKm: roundKm(distance),
    connector: row.connector,
    powerKw: row.power_kw,
    currentType: row.current_type,
    pricePerHour: row.price_per_hour,
    currency: row.currency,
    minDurationMin: row.min_duration_min,
    maxDurationMin: row.max_duration_min,
    houseRules: list(row.house_rules),
    parkingType: row.parking_type,
    amenities: list(row.amenities),
    timezone: row.timezone,
    status: row.status,
    photos: ctx.photos?.get(row.id) ?? [],
    rating: ctx.ratings?.get(row.id) ?? { count: 0, average: null },
    host: serializeHostCard(ctx.hosts?.get(row.host_id)),
    isOwnListing: viewer ? viewer.id === row.host_id : false,
    createdAt: row.created_at,
  };
}

export function serializeListings(rows, { origin, viewer } = {}) {
  const ids = rows.map((row) => row.id);
  const ctx = {
    photos: photosFor(ids),
    ratings: ratingsFor(ids),
    hosts: hostsFor(rows.map((row) => row.host_id)),
    origin,
    viewer,
  };
  return rows.map((row) => serializeListing(row, ctx));
}

/** Adds the details only an owner or a confirmed-booked driver may see. */
export function withPrivateAddress(listing, viewer, { allowed }) {
  const base = serializeListing(listing, { viewer });
  if (!allowed) return base;
  return {
    ...base,
    privateDetails: {
      addressLine: listing.address_line,
      pincode: listing.pincode,
      accessNotes: listing.access_notes,
      lat: listing.lat,
      lng: listing.lng,
    },
  };
}

export function serializeBooking(row, { viewerId, includePrivate = false } = {}) {
  const listing = one('SELECT * FROM listings WHERE id = ?', [row.listing_id]);
  const driver = one('SELECT id, name, phone, phone_verified_at FROM users WHERE id = ?', [
    row.driver_id,
  ]);
  const host = one('SELECT id, name, phone FROM users WHERE id = ?', [row.host_id]);
  const payment = one('SELECT * FROM payments WHERE booking_id = ? ORDER BY created_at DESC', [
    row.id,
  ]);
  const review = one('SELECT id, rating, comment FROM reviews WHERE booking_id = ?', [row.id]);

  const booking = {
    id: row.id,
    ref: row.ref,
    status: row.status,
    startAt: row.start_at,
    endAt: row.end_at,
    durationMin: row.duration_min,
    subtotal: row.subtotal,
    fee: row.fee,
    total: row.total,
    currency: row.currency,
    refundPercent: row.refund_percent,
    refundAmount: row.refund_amount,
    cancelledBy: row.cancelled_by,
    cancelReason: row.cancel_reason,
    checkedInAt: row.checked_in_at,
    completedAt: row.completed_at,
    createdAt: row.created_at,
    houseRules: list(listing?.house_rules),
    timezone: listing?.timezone ?? 'Asia/Kolkata',
    listing: listing
      ? {
          id: listing.id,
          title: listing.title,
          area: listing.area,
          city: listing.city,
          connector: listing.connector,
          powerKw: listing.power_kw,
          currentType: listing.current_type,
          pricePerHour: listing.price_per_hour,
          photos: photosFor([listing.id]).get(listing.id) ?? [],
        }
      : null,
    driver: driver
      ? { id: driver.id, name: driver.name, phoneVerified: Boolean(driver.phone_verified_at) }
      : null,
    host: host ? { id: host.id, name: host.name } : null,
    payment: payment
      ? {
          status: payment.status,
          mode: payment.mode,
          provider: payment.provider,
          amount: payment.amount,
          currency: payment.currency,
          reference: payment.reference,
        }
      : null,
    review: review ? { id: review.id, rating: review.rating, comment: review.comment } : null,
    viewerRole: viewerId === row.driver_id ? 'driver' : viewerId === row.host_id ? 'host' : 'other',
    canReview:
      viewerId === row.driver_id && row.status === 'COMPLETED' && !review,
    canCancel: ['CONFIRMED', 'IN_PROGRESS'].includes(row.status),
  };

  if (viewerId === row.driver_id) {
    booking.checkinCode = row.checkin_code;
  }

  if (includePrivate && listing) {
    booking.privateDetails = {
      addressLine: listing.address_line,
      pincode: listing.pincode,
      accessNotes: listing.access_notes,
      lat: listing.lat,
      lng: listing.lng,
    };
  }

  return booking;
}

export const cancellationMeta = cancellation;
