import jwt from 'jsonwebtoken';
import { config } from '../config.js';
import { one, parseRoles } from '../db/index.js';
import { unauthorized } from './errors.js';

export function signSession(user) {
  return jwt.sign({ sub: user.id, phone: user.phone }, config.jwtSecret, {
    expiresIn: `${config.sessionDays}d`,
    issuer: 'chargeneighbor',
  });
}

export function readSession(token) {
  try {
    return jwt.verify(token, config.jwtSecret, { issuer: 'chargeneighbor' });
  } catch {
    return null;
  }
}

const cookieOptions = () => ({
  httpOnly: true,
  sameSite: 'lax',
  secure: config.cookieSecure,
  path: '/',
  maxAge: config.sessionDays * 24 * 60 * 60 * 1000,
});

export function setSessionCookie(res, user) {
  res.cookie(config.cookieName, signSession(user), cookieOptions());
}

export function clearSessionCookie(res) {
  res.clearCookie(config.cookieName, { ...cookieOptions(), maxAge: undefined });
}

/** Reads the session cookie and attaches the fresh user row to the request. */
export function loadUser(req, _res, next) {
  const token = req.cookies?.[config.cookieName];
  req.user = null;
  if (!token) return next();
  const payload = readSession(token);
  if (!payload?.sub) return next();

  const row = one('SELECT * FROM users WHERE id = ?', [payload.sub]);
  if (!row) return next();

  req.user = {
    id: row.id,
    phone: row.phone,
    name: row.name,
    email: row.email,
    status: row.status,
    roles: parseRoles(row.roles),
    loginId: row.login_id ?? null,
    hasPassword: Boolean(row.password_hash),
    phoneVerifiedAt: row.phone_verified_at,
  };
  return next();
}

export function requireAuth(req, _res, next) {
  if (!req.user) return next(unauthorized());
  if (req.user.status !== 'active') {
    return next(unauthorized('This account is suspended. Contact support for help.'));
  }
  return next();
}

export const hasRole = (req, role) => Boolean(req.user?.roles?.includes(role));

export function requireRole(role) {
  return (req, _res, next) => {
    if (!req.user) return next(unauthorized());
    if (!hasRole(req, role)) {
      return next(
        unauthorized(
          role === 'admin'
            ? 'Admin access is required for this action.'
            : 'You need a host account for this action.',
        ),
      );
    }
    return next();
  };
}

export const isAdmin = (user) => Boolean(user?.roles?.includes('admin'));

/** Home address and access notes are only for a confirmed, live booking. */
export const canSeePrivateAddress = (booking, user) => {
  if (!user || !booking) return false;
  if (isAdmin(user)) return true;
  if (booking.driver_id === user.id) {
    return ['CONFIRMED', 'IN_PROGRESS', 'COMPLETED', 'DISPUTED'].includes(booking.status);
  }
  if (booking.host_id === user.id) return true;
  return false;
};
