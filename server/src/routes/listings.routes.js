import express from 'express';
import { z } from 'zod';
import { all, one } from '../db/index.js';
import { isAdmin } from '../lib/auth.js';
import { boundingBox, distanceKm, roundKm } from '../lib/geo.js';
import { notFound, unprocessable } from '../lib/errors.js';
import { asyncHandler, parse } from '../lib/validate.js';
import { config } from '../config.js';
import { serializeListings, serializeListing, withPrivateAddress } from '../services/serializers.js';
import { slotsForDate, upcomingDays } from '../services/availability.js';
import { quote, validateDuration } from '../services/pricing.js';

const router = express.Router();

const ALLOWED_CONNECTORS = ['Type 2', 'CCS2', 'CHAdeMO', 'Type 1', 'Bharat AC-001', 'Bharat DC-001'];

const searchSchema = z.object({
  q: z.string().trim().max(80).optional(),
  lat: z.coerce.number().min(-90).max(90).optional(),
  lng: z.coerce.number().min(-180).max(180).optional(),
  radius: z.coerce.number().min(1).max(200).optional(),
  connector: z.string().trim().optional(),
  minPower: z.coerce.number().min(0).max(500).optional(),
  maxPrice: z.coerce.number().min(0).optional(),
  currentType: z.enum(['AC', 'DC']).optional(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  durationMin: z.coerce.number().int().min(30).max(720).optional(),
  sort: z.enum(['distance', 'price', 'rating', 'newest']).optional(),
  limit: z.coerce.number().int().min(1).max(60).optional(),
  offset: z.coerce.number().int().min(0).max(2000).optional(),
});

router.get(
  '/',
  asyncHandler(async (req, res) => {
    const filters = parse(searchSchema, req.query);
    const origin =
      Number.isFinite(filters.lat) && Number.isFinite(filters.lng)
        ? { lat: filters.lat, lng: filters.lng }
        : null;

    const where = ["l.status = 'approved'"];
    const params = [];

    if (filters.q) {
      where.push('(LOWER(l.area) LIKE ? OR LOWER(l.city) LIKE ? OR LOWER(l.title) LIKE ?)');
      const needle = `%${filters.q.toLowerCase()}%`;
      params.push(needle, needle, needle);
    }
    if (filters.connector) {
      where.push('l.connector = ?');
      params.push(filters.connector);
    }
    if (filters.currentType) {
      where.push('l.current_type = ?');
      params.push(filters.currentType);
    }
    if (Number.isFinite(filters.minPower)) {
      where.push('l.power_kw >= ?');
      params.push(filters.minPower);
    }
    if (Number.isFinite(filters.maxPrice)) {
      where.push('l.price_per_hour <= ?');
      params.push(filters.maxPrice);
    }

    const radius = filters.radius ?? 25;
    if (origin) {
      const box = boundingBox(origin.lat, origin.lng, radius);
      where.push('l.lat BETWEEN ? AND ? AND l.lng BETWEEN ? AND ?');
      params.push(box.minLat, box.maxLat, box.minLng, box.maxLng);
    }

    const rows = all(
      `SELECT l.* FROM listings l WHERE ${where.join(' AND ')} ORDER BY l.created_at DESC LIMIT 300`,
      params,
    );

    let results = serializeListings(rows, { origin, viewer: req.user })
      .filter((listing) => (origin ? listing.distanceKm <= radius : true));

    if (filters.date) {
      const durationMin = filters.durationMin ?? 60;
      results = results.filter((listing) => {
        const row = rows.find((item) => item.id === listing.id);
        const { slots } = slotsForDate({ listing: row, date: filters.date, durationMin });
        listing.nextSlot = slots[0]?.startAt ?? null;
        return slots.length > 0;
      });
    }

    const sort = filters.sort ?? (origin ? 'distance' : 'newest');
    if (sort === 'distance' && origin) {
      results.sort((a, b) => (a.distanceKm ?? 1e9) - (b.distanceKm ?? 1e9));
    } else if (sort === 'price') {
      results.sort((a, b) => a.pricePerHour - b.pricePerHour);
    } else if (sort === 'rating') {
      results.sort((a, b) => (b.rating.average ?? 0) - (a.rating.average ?? 0));
    } else if (sort === 'newest') {
      results.sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
    }

    const total = results.length;
    const limit = filters.limit ?? 24;
    const offset = filters.offset ?? 0;

    res.json({
      results: results.slice(offset, offset + limit),
      total,
      limit,
      offset,
      origin,
      radiusKm: origin ? radius : null,
      searchArea: filters.q ?? null,
      filtersApplied: Object.fromEntries(
        Object.entries(filters).filter(([, value]) => value !== undefined && value !== ''),
      ),
      connectors: ALLOWED_CONNECTORS,
    });
  }),
);

router.get(
  '/:id',
  asyncHandler(async (req, res) => {
    const listing = one('SELECT * FROM listings WHERE id = ?', [req.params.id]);
    if (!listing) throw notFound('That charger could not be found.');

    const viewerIsOwner = req.user?.id === listing.host_id;
    if (listing.status !== 'approved' && !viewerIsOwner && !isAdmin(req.user)) {
      throw notFound('That charger is not available.');
    }

    const card = withPrivateAddress(listing, req.user, { allowed: viewerIsOwner || isAdmin(req.user) });
    const reviews = all(
      `SELECT r.*, u.name AS author_name FROM reviews r
       JOIN users u ON u.id = r.author_id
       WHERE r.listing_id = ? AND r.status = 'published'
       ORDER BY r.created_at DESC LIMIT 20`,
      [listing.id],
    );

    const configuredMin = listing.min_duration_min;
    res.json({
      listing: card,
      days: upcomingDays({ listing, durationMin: Math.min(configuredMin, 120), days: 7 }),
      reviews: reviews.map((review) => ({
        id: review.id,
        rating: review.rating,
        comment: review.comment,
        author: review.author_name?.split(' ')[0] || 'Driver',
        createdAt: review.created_at,
      })),
      saved: req.user
        ? Boolean(
            one('SELECT 1 AS hit FROM saved_listings WHERE user_id = ? AND listing_id = ?', [
              req.user.id,
              listing.id,
            ]),
          )
        : false,
      policies: {
        platformFeePercent: config.platformFeePercent,
        currency: config.currency,
      },
    });
  }),
);

router.get(
  '/:id/availability',
  asyncHandler(async (req, res) => {
    const schema = z.object({
      date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Pick a date to see free slots.'),
      durationMin: z.coerce.number().int().min(15).max(720).optional(),
    });
    const { date, durationMin } = parse(schema, req.query);

    const listing = one('SELECT * FROM listings WHERE id = ?', [req.params.id]);
    if (!listing) throw notFound('That charger could not be found.');
    if (listing.status !== 'approved' && req.user?.id !== listing.host_id && !isAdmin(req.user)) {
      throw notFound('That charger is not available.');
    }

    const duration = durationMin ?? listing.min_duration_min;
    const durationError = validateDuration(listing, duration);
    if (durationError) throw unprocessable(durationError);

    const result = slotsForDate({ listing, date, durationMin: duration });
    res.json({
      date,
      timezone: result.timezone ?? listing.timezone,
      durationMin: duration,
      slots: result.slots,
      blocked: result.blocked,
      reason: result.reason ?? null,
      price: quote({ pricePerHour: listing.price_per_hour, durationMin: duration }),
      minDurationMin: listing.min_duration_min,
      maxDurationMin: listing.max_duration_min,
      distanceKm: roundKm(
        req.query.lat && req.query.lng
          ? distanceKm(
              { lat: Number(req.query.lat), lng: Number(req.query.lng) },
              { lat: listing.lat, lng: listing.lng },
            )
          : null,
      ),
    });
  }),
);

router.get(
  '/:id/reviews',
  asyncHandler(async (req, res) => {
    const rows = all(
      `SELECT r.rating, r.comment, r.created_at FROM reviews r
       WHERE r.listing_id = ? AND r.status = 'published'
       ORDER BY r.created_at DESC LIMIT 50`,
      [req.params.id],
    );
    res.json({ reviews: rows });
  }),
);

export { ALLOWED_CONNECTORS };
export default router;
