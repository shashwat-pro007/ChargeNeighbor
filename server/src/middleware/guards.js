import rateLimit from 'express-rate-limit';
import { config } from '../config.js';
import { AppError, forbidden } from '../lib/errors.js';

const handler = (_req, _res, next) =>
  next(new AppError(429, 'RATE_LIMITED', 'Too many requests. Please wait a minute and try again.'));

export const generalLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 240,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  handler,
});

/** Sign-in and OTP endpoints get a much tighter budget. */
export const authLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  limit: 40,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  handler,
});

export const writeLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 60,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  handler,
});

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

/**
 * Cookie sessions are SameSite=Lax, and this adds a hard same-origin check for
 * state-changing calls so a cross-site form post cannot ride a session.
 */
export function sameOriginGuard(req, _res, next) {
  if (SAFE_METHODS.has(req.method)) return next();

  const origin = req.get('origin');
  if (!origin) return next(); // non-browser clients, no ambient cookie risk

  let originHost;
  try {
    originHost = new URL(origin).host;
  } catch {
    return next(forbidden('Invalid request origin.'));
  }

  const requestHost = req.get('host');
  const allowed = new Set(
    [requestHost, ...config.allowedOrigins.map((value) => safeHost(value))].filter(Boolean),
  );

  if (!allowed.has(originHost)) {
    return next(forbidden('Cross-site requests are not allowed for this action.'));
  }
  return next();
}

function safeHost(value) {
  try {
    return new URL(value).host;
  } catch {
    return value;
  }
}

/** Never let a browser cache a personalised response. */
export function noStore(_req, res, next) {
  res.set('Cache-Control', 'no-store');
  next();
}
