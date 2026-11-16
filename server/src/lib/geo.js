import crypto from 'node:crypto';

const EARTH_RADIUS_KM = 6371;

const toRad = (deg) => (deg * Math.PI) / 180;

/** Great-circle distance in kilometres. */
export function distanceKm(a, b) {
  if (!a || !b) return null;
  if (![a.lat, a.lng, b.lat, b.lng].every((value) => Number.isFinite(value))) return null;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.min(1, Math.sqrt(h)));
}

/**
 * Public map position for a listing.
 *
 * A residential address must never be published before a booking is confirmed,
 * so the public pin is deterministically shifted by a few hundred metres. The
 * shift is derived from the listing id, which keeps a listing's pin stable
 * across requests without revealing the real coordinates.
 */
export function publicCoords(listing) {
  const digest = crypto
    .createHash('sha256')
    .update(`${String(listing.id)}:coords`)
    .digest();
  // 0..1 from bytes, mapped to -0.0035..0.0035 degrees (~390 m)
  const dLat = ((digest[0] * 256 + digest[1]) / 65535 - 0.5) * 0.007;
  const dLng = ((digest[2] * 256 + digest[3]) / 65535 - 0.5) * 0.007;
  return {
    lat: Number((Number(listing.lat) + dLat).toFixed(4)),
    lng: Number((Number(listing.lng) + dLng).toFixed(4)),
  };
}

/** Rough bounding box used to pre-filter candidates in SQL. */
export function boundingBox(lat, lng, radiusKm) {
  const latDelta = radiusKm / 111.32;
  const cosLat = Math.max(Math.cos(toRad(lat)), 0.01);
  const lngDelta = radiusKm / (111.32 * cosLat);
  return {
    minLat: lat - latDelta,
    maxLat: lat + latDelta,
    minLng: lng - lngDelta,
    maxLng: lng + lngDelta,
  };
}

export const roundKm = (value) =>
  value === null || value === undefined ? null : Math.round(value * 10) / 10;
