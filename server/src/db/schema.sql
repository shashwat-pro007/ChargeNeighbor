-- ---------------------------------------------------------------------------
-- ChargeNeighbor schema (SQLite)
-- Applied idempotently on boot. Times are stored as ISO-8601 UTC strings.
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS users (
  id                TEXT PRIMARY KEY,
  phone             TEXT NOT NULL UNIQUE,
  name              TEXT,
  email             TEXT,
  roles             TEXT NOT NULL DEFAULT 'driver', -- comma separated: driver,host,admin
  status            TEXT NOT NULL DEFAULT 'active', -- active | suspended
  phone_verified_at TEXT,
  last_login_at     TEXT,
  login_id          TEXT, -- optional handle for password sign-in, stored lowercase
  password_hash     TEXT, -- scrypt$salt$hash, never returned by the API
  created_at        TEXT NOT NULL,
  updated_at        TEXT NOT NULL
);
-- The unique index on users(login_id) is created after the migration below,
-- because a database from an earlier version does not have the column yet.

CREATE TABLE IF NOT EXISTS otp_codes (
  id           TEXT PRIMARY KEY,
  phone        TEXT NOT NULL,
  code_hash    TEXT NOT NULL,
  test_mode    INTEGER NOT NULL DEFAULT 0,
  attempts     INTEGER NOT NULL DEFAULT 0,
  expires_at   TEXT NOT NULL,
  consumed_at  TEXT,
  created_at   TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_otp_phone ON otp_codes (phone, created_at DESC);

CREATE TABLE IF NOT EXISTS host_profiles (
  user_id      TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  display_name TEXT,
  about        TEXT,
  verification TEXT NOT NULL DEFAULT 'none', -- none | requested | verified | rejected
  created_at   TEXT NOT NULL,
  updated_at   TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS vehicles (
  id            TEXT PRIMARY KEY,
  user_id       TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  label         TEXT,
  make_model    TEXT NOT NULL,
  connector     TEXT NOT NULL,
  battery_kwh   REAL,
  efficiency    REAL, -- Wh per km, optional
  is_default    INTEGER NOT NULL DEFAULT 0,
  created_at    TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_vehicles_user ON vehicles (user_id);

CREATE TABLE IF NOT EXISTS listings (
  id                TEXT PRIMARY KEY,
  host_id           TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title             TEXT NOT NULL,
  description       TEXT,
  address_line      TEXT NOT NULL, -- private, revealed after confirmation
  area              TEXT NOT NULL, -- public neighbourhood
  city              TEXT NOT NULL,
  pincode           TEXT,
  lat               REAL NOT NULL, -- fuzzed for public responses
  lng               REAL NOT NULL,
  connector         TEXT NOT NULL,
  power_kw          REAL NOT NULL,
  current_type      TEXT NOT NULL DEFAULT 'AC', -- AC | DC
  price_per_hour    REAL NOT NULL,
  currency          TEXT NOT NULL DEFAULT 'INR',
  min_duration_min  INTEGER NOT NULL DEFAULT 60,
  max_duration_min  INTEGER NOT NULL DEFAULT 480,
  house_rules       TEXT,
  access_notes      TEXT, -- private
  parking_type      TEXT,
  amenities         TEXT, -- comma separated
  timezone          TEXT NOT NULL DEFAULT 'Asia/Kolkata',
  status            TEXT NOT NULL DEFAULT 'draft', -- draft | pending | approved | rejected | paused
  rejection_reason  TEXT,
  reviewed_by       TEXT,
  reviewed_at       TEXT,
  created_at        TEXT NOT NULL,
  updated_at        TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_listings_status ON listings (status);
CREATE INDEX IF NOT EXISTS idx_listings_host ON listings (host_id);

CREATE TABLE IF NOT EXISTS listing_photos (
  id         TEXT PRIMARY KEY,
  listing_id TEXT NOT NULL REFERENCES listings(id) ON DELETE CASCADE,
  url        TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_photos_listing ON listing_photos (listing_id);

CREATE TABLE IF NOT EXISTS availability_rules (
  id         TEXT PRIMARY KEY,
  listing_id TEXT NOT NULL REFERENCES listings(id) ON DELETE CASCADE,
  weekday    INTEGER NOT NULL, -- 0 = Sunday ... 6 = Saturday, listing-local
  start_time TEXT NOT NULL,    -- 'HH:MM'
  end_time   TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_rules_listing ON availability_rules (listing_id);

CREATE TABLE IF NOT EXISTS availability_exceptions (
  id         TEXT PRIMARY KEY,
  listing_id TEXT NOT NULL REFERENCES listings(id) ON DELETE CASCADE,
  date       TEXT NOT NULL, -- 'YYYY-MM-DD' listing-local
  is_blocked INTEGER NOT NULL DEFAULT 1,
  note       TEXT,
  created_at TEXT NOT NULL,
  UNIQUE (listing_id, date)
);

CREATE TABLE IF NOT EXISTS bookings (
  id             TEXT PRIMARY KEY,
  ref            TEXT NOT NULL UNIQUE,
  listing_id     TEXT NOT NULL REFERENCES listings(id) ON DELETE RESTRICT,
  driver_id      TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  host_id        TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  vehicle_id     TEXT,
  start_at       TEXT NOT NULL, -- ISO UTC
  end_at         TEXT NOT NULL,
  duration_min   INTEGER NOT NULL,
  status         TEXT NOT NULL, -- CONFIRMED | IN_PROGRESS | COMPLETED | CANCELLED | NO_SHOW | DISPUTED
  subtotal       REAL NOT NULL,
  fee            REAL NOT NULL,
  total          REAL NOT NULL,
  refund_percent INTEGER NOT NULL DEFAULT 0,
  refund_amount  REAL NOT NULL DEFAULT 0,
  currency       TEXT NOT NULL,
  checkin_code   TEXT NOT NULL,
  checked_in_at  TEXT,
  completed_at   TEXT,
  cancelled_by   TEXT, -- driver | host | system
  cancel_reason  TEXT,
  price_snapshot TEXT NOT NULL DEFAULT '{}',
  created_at     TEXT NOT NULL,
  updated_at     TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_bookings_listing_time ON bookings (listing_id, start_at, end_at);
CREATE INDEX IF NOT EXISTS idx_bookings_driver ON bookings (driver_id);
CREATE INDEX IF NOT EXISTS idx_bookings_host ON bookings (host_id);

CREATE TABLE IF NOT EXISTS payments (
  id           TEXT PRIMARY KEY,
  booking_id   TEXT NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
  provider     TEXT NOT NULL DEFAULT 'offline',
  reference    TEXT,
  amount       REAL NOT NULL,
  currency     TEXT NOT NULL,
  status       TEXT NOT NULL, -- DUE_AT_SESSION | PENDING | PAID | REFUND_PENDING | REFUNDED | FAILED
  mode         TEXT NOT NULL,
  created_at   TEXT NOT NULL,
  updated_at   TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_payments_booking ON payments (booking_id);

CREATE TABLE IF NOT EXISTS reviews (
  id         TEXT PRIMARY KEY,
  booking_id TEXT NOT NULL UNIQUE REFERENCES bookings(id) ON DELETE CASCADE,
  listing_id TEXT NOT NULL REFERENCES listings(id) ON DELETE CASCADE,
  author_id  TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  rating     INTEGER NOT NULL,
  comment    TEXT,
  status     TEXT NOT NULL DEFAULT 'published',
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_reviews_listing ON reviews (listing_id);

CREATE TABLE IF NOT EXISTS saved_listings (
  user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  listing_id TEXT NOT NULL REFERENCES listings(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL,
  PRIMARY KEY (user_id, listing_id)
);

CREATE TABLE IF NOT EXISTS reports (
  id          TEXT PRIMARY KEY,
  reporter_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  target_type TEXT NOT NULL, -- listing | booking | user | other
  target_id   TEXT,
  category    TEXT NOT NULL,
  details     TEXT NOT NULL,
  status      TEXT NOT NULL DEFAULT 'OPEN', -- OPEN | REVIEWING | RESOLVED
  resolution  TEXT,
  resolved_by TEXT,
  created_at  TEXT NOT NULL,
  updated_at  TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_reports_status ON reports (status);

CREATE TABLE IF NOT EXISTS notifications (
  id         TEXT PRIMARY KEY,
  user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind       TEXT NOT NULL,
  title      TEXT NOT NULL,
  body       TEXT,
  link       TEXT,
  read_at    TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications (user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS audit_logs (
  id          TEXT PRIMARY KEY,
  actor_id    TEXT,
  action      TEXT NOT NULL,
  entity_type TEXT,
  entity_id   TEXT,
  meta        TEXT,
  ip          TEXT,
  created_at  TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_audit_created ON audit_logs (created_at DESC);
