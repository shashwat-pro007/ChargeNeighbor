import 'dotenv/config';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
export const SERVER_ROOT = path.resolve(here, '..');

const bool = (value, fallback = false) => {
  if (value === undefined || value === '') return fallback;
  return ['1', 'true', 'yes', 'on'].includes(String(value).toLowerCase());
};

const int = (value, fallback) => {
  const parsed = Number.parseInt(value ?? '', 10);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const num = (value, fallback) => {
  const parsed = Number.parseFloat(value ?? '');
  return Number.isFinite(parsed) ? parsed : fallback;
};

const list = (value) =>
  String(value ?? '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);

const resolveFromServer = (value, fallback) =>
  path.resolve(SERVER_ROOT, value || fallback);

const NODE_ENV = process.env.NODE_ENV || 'development';
const isProduction = NODE_ENV === 'production';

const DATA_DIR = resolveFromServer(process.env.DATA_DIR, './data');
const UPLOAD_DIR = resolveFromServer(process.env.UPLOAD_DIR, './uploads');

for (const dir of [DATA_DIR, UPLOAD_DIR]) {
  fs.mkdirSync(dir, { recursive: true });
}

const warn = [];
const fail = [];

/**
 * Session signing secret. In development we generate one and keep it on disk so
 * a restart does not sign everybody out. In production it must be provided.
 */
function resolveJwtSecret() {
  if (process.env.JWT_SECRET && process.env.JWT_SECRET.length >= 16) {
    return process.env.JWT_SECRET;
  }
  if (isProduction) {
    fail.push(
      'JWT_SECRET is missing. Set a long random value (32+ characters) before running in production.',
    );
    return 'missing-secret';
  }
  const secretFile = path.join(DATA_DIR, '.jwt-secret');
  try {
    if (fs.existsSync(secretFile)) {
      const existing = fs.readFileSync(secretFile, 'utf8').trim();
      if (existing.length >= 32) return existing;
    }
    const generated = crypto.randomBytes(48).toString('hex');
    fs.writeFileSync(secretFile, generated, { mode: 0o600 });
    warn.push('JWT_SECRET not set — generated a development secret in data/.jwt-secret.');
    return generated;
  } catch {
    warn.push('JWT_SECRET not set — using an ephemeral secret; sessions reset on restart.');
    return crypto.randomBytes(48).toString('hex');
  }
}

export const config = {
  env: NODE_ENV,
  isProduction,
  port: int(process.env.PORT, 4000),
  dataDir: DATA_DIR,
  dbFile: path.join(DATA_DIR, 'chargeneighbor.db'),
  uploadDir: UPLOAD_DIR,
  maxUploadBytes: int(process.env.MAX_UPLOAD_MB, 5) * 1024 * 1024,

  // Number of proxy hops in front of the API. Kept explicit so IP based rate
  // limiting cannot be bypassed by a forged X-Forwarded-For header.
  trustProxy: int(process.env.TRUST_PROXY, isProduction ? 1 : 0) || false,

  jwtSecret: resolveJwtSecret(),
  sessionDays: int(process.env.SESSION_DAYS, 30),
  cookieName: 'cn_session',
  cookieSecure: bool(process.env.COOKIE_SECURE, isProduction),
  allowedOrigins: list(process.env.ALLOWED_ORIGINS),

  platformFeePercent: num(process.env.PLATFORM_FEE_PERCENT, 8),
  currency: process.env.CURRENCY || 'INR',
  defaultTimezone: process.env.DEFAULT_TIMEZONE || 'Asia/Kolkata',
  minLeadMinutes: int(process.env.MIN_LEAD_MINUTES, 30),
  slotStepMinutes: int(process.env.SLOT_STEP_MINUTES, 30),

  paymentsMode: (process.env.PAYMENTS_MODE || 'offline').toLowerCase(),

  otp: {
    ttlMinutes: int(process.env.OTP_TTL_MINUTES, 5),
    maxAttempts: int(process.env.OTP_MAX_ATTEMPTS, 5),
    resendSeconds: int(process.env.OTP_RESEND_SECONDS, 45),
  },

  testLogin: {
    enabled: bool(process.env.TEST_LOGIN_ENABLED, !isProduction),
    otp: process.env.TEST_OTP || '123456',
    numbers: list(process.env.TEST_PHONE_NUMBERS),
    prefixes: list(process.env.TEST_PHONE_PREFIXES),
  },

  adminPhones: list(process.env.ADMIN_PHONES),
  warnings: warn,
  failures: fail,
};

if (!process.env.ADMIN_PHONES) {
  warn.push(
    'ADMIN_PHONES is empty — nobody will get admin review access. Set your own number and restart.',
  );
}

if (config.testLogin.enabled && config.isProduction) {
  warn.push(
    'TEST_LOGIN_ENABLED is on in production. This lets allowlisted numbers sign in with a fixed OTP. Turn it off before real users arrive.',
  );
}

export const isTestPhone = (phone) => {
  if (!config.testLogin.enabled) return false;
  if (config.testLogin.numbers.includes(phone)) return true;
  return config.testLogin.prefixes.some(
    (prefix) => prefix.length > 0 && phone.startsWith(prefix),
  );
};
