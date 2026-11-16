import express from 'express';
import { z } from 'zod';
import { config } from '../config.js';
import { listingRules } from '../config/policies.js';
import { all, newId, nowIso, one, run, transaction } from '../db/index.js';
import { requireAuth, requireRole } from '../lib/auth.js';
import { badRequest, conflict, notFound, unprocessable } from '../lib/errors.js';
import { asyncHandler, parse } from '../lib/validate.js';
import { audit } from '../lib/audit.js';
import { isValidTimeZone, parseClock } from '../lib/time.js';
import { photoUpload, uploadedPath } from '../middleware/upload.js';
import { serializeListings } from '../services/serializers.js';
import { ALLOWED_CONNECTORS } from './listings.routes.js';

const router = express.Router();

router.use(requireAuth, requireRole('host'));

const listingSchema = z.object({
  title: z.string().trim().min(4, 'Give your charger a short title.').max(90),
  description: z.string().trim().max(1200).optional().default(''),
  addressLine: z.string().trim().min(6, 'Enter the full street address (kept private).').max(200),
  area: z.string().trim().min(2, 'Enter the neighbourhood shown publicly.').max(80),
  city: z.string().trim().min(2, 'Enter the city.').max(80),
  pincode: z.string().trim().max(12).optional().default(''),
  lat: z.coerce.number().min(-90).max(90),
  lng: z.coerce.number().min(-180).max(180),
  connector: z.enum(ALLOWED_CONNECTORS, {
    errorMap: () => ({ message: 'Pick a supported connector type.' }),
  }),
  powerKw: z.coerce.number().min(1, 'Rated power must be at least 1 kW.').max(350),
  currentType: z.enum(['AC', 'DC']),
  pricePerHour: z.coerce.number().min(1, 'Set an hourly price.').max(100000),
  minDurationMin: z.coerce.number().int().min(30).max(720).default(60),
  maxDurationMin: z.coerce.number().int().min(30).max(720).default(480),
  houseRules: z.array(z.string().trim().max(120)).max(10).optional().default([]),
  accessNotes: z.string().trim().max(600).optional().default(''),
  parkingType: z.string().trim().max(60).optional().default(''),
  amenities: z.array(z.string().trim().max(40)).max(12).optional().default([]),
  timezone: z.string().trim().optional(),
});

const patchSchema = listingSchema.partial();

const toRowFields = (data) => ({
  title: data.title,
  description: data.description || null,
  address_line: data.addressLine,
  area: data.area,
  city: data.city,
  pincode: data.pincode || null,
  lat: data.lat,
  lng: data.lng,
  connector: data.connector,
  power_kw: data.powerKw,
  current_type: data.currentType,
  price_per_hour: data.pricePerHour,
  min_duration_min: data.minDurationMin,
  max_duration_min: data.maxDurationMin,
  house_rules: (data.houseRules ?? []).join(','),
  access_notes: data.accessNotes || null,
  parking_type: data.parkingType || null,
  amenities: (data.amenities ?? []).join(','),
});

const serializeOwnListing = (row) => ({
  ...serializeListings([row], { viewer: { id: row.host_id } })[0],
  privateDetails: {
    addressLine: row.address_line,
    pincode: row.pincode,
    accessNotes: row.access_notes,
    lat: row.lat,
    lng: row.lng,
  },
  rejectionReason: row.rejection_reason,
  reviewedAt: row.reviewed_at,
});

function ownListing(userId, id) {
  const row = one('SELECT * FROM listings WHERE id = ? AND host_id = ?', [id, userId]);
  if (!row) throw notFound('That listing could not be found on your account.');
  return row;
}

router.get(
  '/summary',
  asyncHandler(async (req, res) => {
    const listings = all('SELECT * FROM listings WHERE host_id = ? ORDER BY created_at DESC', [
      req.user.id,
    ]);

    const earnings = one(
      `SELECT
         COALESCE(SUM(CASE WHEN status = 'COMPLETED' THEN subtotal - refund_amount ELSE 0 END), 0) AS net,
         COALESCE(SUM(CASE WHEN status = 'COMPLETED' THEN 1 ELSE 0 END), 0) AS sessions
       FROM bookings WHERE host_id = ?`,
      [req.user.id],
    );

    const upcoming = all(
      `SELECT b.* FROM bookings b
       WHERE b.host_id = ? AND b.status IN ('CONFIRMED','IN_PROGRESS')
       ORDER BY b.start_at ASC LIMIT 5`,
      [req.user.id],
    );

    const pending = all("SELECT * FROM bookings WHERE host_id = ? AND status = 'DISPUTED'", [
      req.user.id,
    ]);

    res.json({
      listings: listings.map(serializeOwnListing),
      earnings: {
        net: Math.round(Number(earnings?.net ?? 0) * 100) / 100,
        sessions: earnings?.sessions ?? 0,
        currency: config.currency,
        platformFeePercent: config.platformFeePercent,
      },
      upcoming: upcoming.map((row) => ({
        id: row.id,
        ref: row.ref,
        startAt: row.start_at,
        endAt: row.end_at,
        status: row.status,
        total: row.total,
        subtotal: row.subtotal,
      })),
      disputes: pending.length,
      statusCounts: listings.reduce((acc, row) => {
        acc[row.status] = (acc[row.status] ?? 0) + 1;
        return acc;
      }, {}),
    });
  }),
);

router.get(
  '/profile',
  asyncHandler(async (req, res) => {
    const profile = one('SELECT * FROM host_profiles WHERE user_id = ?', [req.user.id]);
    res.json({
      profile: profile
        ? {
            displayName: profile.display_name,
            about: profile.about,
            verification: profile.verification,
          }
        : { displayName: null, about: null, verification: 'none' },
    });
  }),
);

router.patch(
  '/profile',
  asyncHandler(async (req, res) => {
    const data = parse(
      z.object({
        displayName: z.string().trim().min(2, 'Enter a display name.').max(60).optional(),
        about: z.string().trim().max(600).optional(),
        requestVerification: z.boolean().optional(),
      }),
      req.body,
    );

    const now = nowIso();
    const existing = one('SELECT * FROM host_profiles WHERE user_id = ?', [req.user.id]);
    if (!existing) {
      run(
        `INSERT INTO host_profiles (user_id, display_name, about, verification, created_at, updated_at)
         VALUES (?,?,?,?,?,?)`,
        [
          req.user.id,
          data.displayName ?? null,
          data.about ?? null,
          data.requestVerification ? 'requested' : 'none',
          now,
          now,
        ],
      );
    } else {
      run(
        `UPDATE host_profiles SET display_name = ?, about = ?, verification = ?, updated_at = ?
         WHERE user_id = ?`,
        [
          data.displayName ?? existing.display_name,
          data.about ?? existing.about,
          data.requestVerification ? 'requested' : existing.verification,
          now,
          req.user.id,
        ],
      );
    }

    res.json({ ok: true, message: data.requestVerification ? 'Verification requested. Our team will review it.' : 'Host profile updated.' });
  }),
);

router.get(
  '/listings',
  asyncHandler(async (req, res) => {
    const rows = all('SELECT * FROM listings WHERE host_id = ? ORDER BY created_at DESC', [
      req.user.id,
    ]);
    res.json({ listings: rows.map(serializeOwnListing) });
  }),
);

router.post(
  '/listings',
  asyncHandler(async (req, res) => {
    const data = parse(listingSchema, req.body);
    if (data.maxDurationMin < data.minDurationMin) {
      throw unprocessable('The longest session cannot be shorter than the shortest.', [
        { field: 'maxDurationMin', message: 'Must be at least the minimum duration.' },
      ]);
    }
    const timezone = data.timezone || config.defaultTimezone;
    if (!isValidTimeZone(timezone)) {
      throw unprocessable('That timezone is not recognised.', [
        { field: 'timezone', message: 'Invalid timezone.' },
      ]);
    }

    const fields = toRowFields(data);
    const id = newId();
    const now = nowIso();

    run(
      `INSERT INTO listings (
         id, host_id, title, description, address_line, area, city, pincode, lat, lng,
         connector, power_kw, current_type, price_per_hour, currency, min_duration_min, max_duration_min,
         house_rules, access_notes, parking_type, amenities, timezone, status, created_at, updated_at
       ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?, 'draft', ?, ?)`,
      [
        id,
        req.user.id,
        fields.title,
        fields.description,
        fields.address_line,
        fields.area,
        fields.city,
        fields.pincode,
        fields.lat,
        fields.lng,
        fields.connector,
        fields.power_kw,
        fields.current_type,
        fields.price_per_hour,
        config.currency,
        fields.min_duration_min,
        fields.max_duration_min,
        fields.house_rules,
        fields.access_notes,
        fields.parking_type,
        fields.amenities,
        timezone,
        now,
        now,
      ],
    );

    audit({ actorId: req.user.id, action: 'listing.created', entityType: 'listing', entityId: id, ip: req.ip });
    const row = one('SELECT * FROM listings WHERE id = ?', [id]);
    res.status(201).json({ listing: serializeOwnListing(row), message: 'Listing saved as a draft.' });
  }),
);

router.patch(
  '/listings/:id',
  asyncHandler(async (req, res) => {
    const existing = ownListing(req.user.id, req.params.id);
    const data = parse(patchSchema, req.body, 'Check the listing fields.');
    const merged = mergeListingFields(existing, data);

    if (Number(merged.max_duration_min) < Number(merged.min_duration_min)) {
      throw unprocessable('The longest session cannot be shorter than the shortest.', [
        { field: 'maxDurationMin', message: 'Must be at least the minimum duration.' },
      ]);
    }

    const now = nowIso();
    // A material change to a live listing goes back through review.
    const needsReview = existing.status === 'approved';
    const nextStatus = needsReview ? 'pending' : existing.status === 'rejected' ? 'draft' : existing.status;

    run(
      `UPDATE listings SET title = ?, description = ?, address_line = ?, area = ?, city = ?, pincode = ?,
         lat = ?, lng = ?, connector = ?, power_kw = ?, current_type = ?, price_per_hour = ?,
         min_duration_min = ?, max_duration_min = ?, house_rules = ?, access_notes = ?, parking_type = ?,
         amenities = ?, status = ?, updated_at = ?
       WHERE id = ? AND host_id = ?`,
      [
        merged.title,
        merged.description,
        merged.address_line,
        merged.area,
        merged.city,
        merged.pincode,
        merged.lat,
        merged.lng,
        merged.connector,
        merged.power_kw,
        merged.current_type,
        merged.price_per_hour,
        merged.min_duration_min,
        merged.max_duration_min,
        merged.house_rules,
        merged.access_notes,
        merged.parking_type,
        merged.amenities,
        nextStatus,
        now,
        existing.id,
        req.user.id,
      ],
    );

    audit({
      actorId: req.user.id,
      action: 'listing.updated',
      entityType: 'listing',
      entityId: existing.id,
      meta: { needsReview },
      ip: req.ip,
    });

    const row = one('SELECT * FROM listings WHERE id = ?', [existing.id]);
    res.json({
      listing: serializeOwnListing(row),
      message: needsReview
        ? 'Listing updated and sent back for review. It stays hidden until approved.'
        : 'Listing updated.',
    });
  }),
);

/** Field-by-field merge: only the keys the host actually sent are replaced. */
function mergeListingFields(row, data) {
  const pick = (key, column, fallback = row[column]) =>
    data[key] === undefined ? fallback : data[key];

  return {
    title: pick('title', 'title'),
    description: pick('description', 'description'),
    address_line: pick('addressLine', 'address_line'),
    area: pick('area', 'area'),
    city: pick('city', 'city'),
    pincode: pick('pincode', 'pincode'),
    lat: pick('lat', 'lat'),
    lng: pick('lng', 'lng'),
    connector: pick('connector', 'connector'),
    power_kw: pick('powerKw', 'power_kw'),
    current_type: pick('currentType', 'current_type'),
    price_per_hour: pick('pricePerHour', 'price_per_hour'),
    min_duration_min: pick('minDurationMin', 'min_duration_min'),
    max_duration_min: pick('maxDurationMin', 'max_duration_min'),
    house_rules: data.houseRules === undefined ? row.house_rules : data.houseRules.join(','),
    access_notes: pick('accessNotes', 'access_notes'),
    parking_type: pick('parkingType', 'parking_type'),
    amenities: data.amenities === undefined ? row.amenities : data.amenities.join(','),
  };
}

router.post(
  '/listings/:id/submit',
  asyncHandler(async (req, res) => {
    const listing = ownListing(req.user.id, req.params.id);
    if (listing.status === 'pending') throw conflict('This listing is already waiting for review.');
    if (listing.status === 'approved') throw conflict('This listing is already live.');

    const problems = [];
    const descriptionLength = String(listing.description ?? '').trim().length;
    if (descriptionLength < listingRules.descriptionMin) {
      problems.push({
        field: 'description',
        message:
          descriptionLength === 0
            ? `Add a description of at least ${listingRules.descriptionMin} characters — a couple of sentences about the charger and parking.`
            : `The description is ${descriptionLength} characters. Add ${listingRules.descriptionMin - descriptionLength} more to reach the ${listingRules.descriptionMin} character minimum.`,
      });
    }
    const photoCount = one('SELECT COUNT(*) AS count FROM listing_photos WHERE listing_id = ?', [listing.id]);
    if (photoCount.count < listingRules.photosMin) {
      problems.push({ field: 'photos', message: 'Add at least one photo of the charger and parking space.' });
    }
    const ruleCount = one('SELECT COUNT(*) AS count FROM availability_rules WHERE listing_id = ?', [listing.id]);
    if (ruleCount.count < listingRules.availabilityWindowsMin) {
      problems.push({ field: 'availability', message: 'Add at least one weekly availability window.' });
    }
    if (listingRules.requiresAccessNotes && !listing.access_notes) {
      problems.push({ field: 'accessNotes', message: 'Tell the driver how to reach the charger after booking.' });
    }

    if (problems.length > 0) {
      throw unprocessable('Finish these steps before submitting for review.', problems);
    }

    run("UPDATE listings SET status = 'pending', rejection_reason = NULL, updated_at = ? WHERE id = ?", [
      nowIso(),
      listing.id,
    ]);
    audit({ actorId: req.user.id, action: 'listing.submitted', entityType: 'listing', entityId: listing.id, ip: req.ip });

    const row = one('SELECT * FROM listings WHERE id = ?', [listing.id]);
    res.json({ listing: serializeOwnListing(row), message: 'Submitted for review. We usually respond within one working day.' });
  }),
);

router.post(
  '/listings/:id/pause',
  asyncHandler(async (req, res) => {
    const { paused } = parse(z.object({ paused: z.boolean() }), req.body);
    const listing = ownListing(req.user.id, req.params.id);

    if (!paused && listing.status !== 'paused') {
      throw conflict(`Only a paused listing can be resumed (currently ${listing.status}).`);
    }
    if (paused && listing.status === 'pending') {
      throw conflict('This listing is waiting for review; nothing to pause yet.');
    }

    const nextStatus = paused ? 'paused' : 'approved';
    if (paused && listing.status !== 'approved') {
      throw conflict('Only an approved listing can be paused.');
    }

    run('UPDATE listings SET status = ?, updated_at = ? WHERE id = ?', [
      nextStatus,
      nowIso(),
      listing.id,
    ]);
    audit({
      actorId: req.user.id,
      action: paused ? 'listing.paused' : 'listing.resumed',
      entityType: 'listing',
      entityId: listing.id,
      ip: req.ip,
    });

    const row = one('SELECT * FROM listings WHERE id = ?', [listing.id]);
    res.json({
      listing: serializeOwnListing(row),
      message: paused
        ? 'Listing paused. It is hidden from search; existing bookings still stand.'
        : 'Listing is live again.',
    });
  }),
);

router.delete(
  '/listings/:id',
  asyncHandler(async (req, res) => {
    const listing = ownListing(req.user.id, req.params.id);
    const upcoming = one(
      `SELECT ref FROM bookings WHERE listing_id = ? AND status IN ('CONFIRMED','IN_PROGRESS') LIMIT 1`,
      [listing.id],
    );
    if (upcoming) {
      throw conflict(
        `This listing has an active booking (${upcoming.ref}). Cancel or complete it before deleting.`,
      );
    }
    run('DELETE FROM listings WHERE id = ?', [listing.id]);
    audit({ actorId: req.user.id, action: 'listing.deleted', entityType: 'listing', entityId: listing.id, ip: req.ip });
    res.json({ ok: true, message: 'Listing deleted.' });
  }),
);

/* ------------------------------------------------------------------ photos */

router.post(
  '/listings/:id/photos',
  (req, res, next) => {
    photoUpload(req, res, (error) => {
      if (error) return next(error);
      return next();
    });
  },
  asyncHandler(async (req, res) => {
    const listing = ownListing(req.user.id, req.params.id);
    if (!req.file) throw badRequest('Choose a photo to upload.');

    const count = one('SELECT COUNT(*) AS count FROM listing_photos WHERE listing_id = ?', [listing.id]);
    if (count.count >= 8) throw conflict('You can add up to 8 photos per listing.');

    run(
      'INSERT INTO listing_photos (id, listing_id, url, sort_order, created_at) VALUES (?,?,?,?,?)',
      [newId(), listing.id, uploadedPath(req.file), count.count, nowIso()],
    );

    const row = one('SELECT * FROM listings WHERE id = ?', [listing.id]);
    res.status(201).json({ listing: serializeOwnListing(row), message: 'Photo added.' });
  }),
);

router.delete(
  '/listings/:id/photos/:photoId',
  asyncHandler(async (req, res) => {
    const listing = ownListing(req.user.id, req.params.id);
    const result = run('DELETE FROM listing_photos WHERE id = ? AND listing_id = ?', [
      req.params.photoId,
      listing.id,
    ]);
    if (result.changes === 0) throw notFound('That photo is not on this listing.');
    const row = one('SELECT * FROM listings WHERE id = ?', [listing.id]);
    res.json({ listing: serializeOwnListing(row), message: 'Photo removed.' });
  }),
);

/* -------------------------------------------------------------- availability */

router.get(
  '/listings/:id/availability',
  asyncHandler(async (req, res) => {
    const listing = ownListing(req.user.id, req.params.id);
    const rules = all(
      'SELECT * FROM availability_rules WHERE listing_id = ? ORDER BY weekday, start_time',
      [listing.id],
    );
    const exceptions = all(
      'SELECT * FROM availability_exceptions WHERE listing_id = ? ORDER BY date',
      [listing.id],
    );
    res.json({
      timezone: listing.timezone,
      rules: rules.map((rule) => ({
        id: rule.id,
        weekday: rule.weekday,
        startTime: rule.start_time,
        endTime: rule.end_time,
      })),
      exceptions: exceptions.map((row) => ({
        date: row.date,
        isBlocked: Boolean(row.is_blocked),
        note: row.note,
      })),
    });
  }),
);

router.put(
  '/listings/:id/availability',
  asyncHandler(async (req, res) => {
    const listing = ownListing(req.user.id, req.params.id);
    const data = parse(
      z.object({
        rules: z
          .array(
            z.object({
              weekday: z.coerce.number().int().min(0).max(6),
              startTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Use 24 hour times like 08:00.'),
              endTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Use 24 hour times like 20:00.'),
            }),
          )
          .max(30),
        exceptions: z
          .array(
            z.object({
              date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD.'),
              isBlocked: z.boolean().default(true),
              note: z.string().trim().max(120).optional(),
            }),
          )
          .max(90)
          .optional()
          .default([]),
      }),
      req.body,
    );

    for (const rule of data.rules) {
      const start = parseClock(rule.startTime);
      const end = parseClock(rule.endTime);
      if (start >= end) {
        throw unprocessable('Each window must end after it starts.', {
          availability: `${rule.startTime}–${rule.endTime} is not a valid window.`,
        });
      }
    }

    const now = nowIso();
    transaction(() => {
      run('DELETE FROM availability_rules WHERE listing_id = ?', [listing.id]);
      for (const rule of data.rules) {
        run(
          'INSERT INTO availability_rules (id, listing_id, weekday, start_time, end_time, created_at) VALUES (?,?,?,?,?,?)',
          [newId(), listing.id, rule.weekday, rule.startTime, rule.endTime, now],
        );
      }
      run('DELETE FROM availability_exceptions WHERE listing_id = ?', [listing.id]);
      for (const exception of data.exceptions) {
        run(
          `INSERT INTO availability_exceptions (id, listing_id, date, is_blocked, note, created_at)
           VALUES (?,?,?,?,?,?)`,
          [
            newId(),
            listing.id,
            exception.date,
            exception.isBlocked ? 1 : 0,
            exception.note ?? null,
            now,
          ],
        );
      }
    });

    audit({ actorId: req.user.id, action: 'listing.availability_updated', entityType: 'listing', entityId: listing.id, ip: req.ip });
    res.json({ ok: true, message: 'Availability saved.' });
  }),
);

export default router;
