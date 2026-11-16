import crypto from 'node:crypto';

const SALT_BYTES = 16;
const KEY_BYTES = 64;

export const PASSWORD_MIN = 8;
export const PASSWORD_MAX = 100;
/** 4-20 characters, starts with a letter, letters/numbers/dot/underscore. */
export const LOGIN_ID_PATTERN = /^[a-z][a-z0-9._]{3,19}$/;

export const normaliseLoginId = (value) => String(value ?? '').trim().toLowerCase();

export function hashPassword(password) {
  const salt = crypto.randomBytes(SALT_BYTES).toString('hex');
  const derived = crypto.scryptSync(String(password), salt, KEY_BYTES).toString('hex');
  return `scrypt$${salt}$${derived}`;
}

/** Constant-time check against a stored `scrypt$salt$hash` string. */
export function verifyPassword(password, stored) {
  if (!stored || typeof password !== 'string' || password.length === 0) return false;
  const [scheme, salt, expected] = String(stored).split('$');
  if (scheme !== 'scrypt' || !salt || !expected) return false;

  const expectedBuffer = Buffer.from(expected, 'hex');
  if (expectedBuffer.length !== KEY_BYTES) return false;

  const actual = crypto.scryptSync(password, salt, KEY_BYTES);
  return crypto.timingSafeEqual(actual, expectedBuffer);
}

/**
 * Burn a comparable amount of work when the login ID does not exist, so the
 * response time does not reveal which IDs are registered.
 */
export function fakeVerify(password) {
  crypto.scryptSync(String(password ?? 'x'), 'f'.repeat(SALT_BYTES * 2), KEY_BYTES);
  return false;
}

/** Human readable password rules, returned so the UI and API cannot disagree. */
export function passwordProblems(password, { loginId, phone } = {}) {
  const value = String(password ?? '');
  const problems = [];
  if (value.length < PASSWORD_MIN) problems.push(`Use at least ${PASSWORD_MIN} characters.`);
  if (value.length > PASSWORD_MAX) problems.push(`Use no more than ${PASSWORD_MAX} characters.`);
  if (!/[a-zA-Z]/.test(value)) problems.push('Include at least one letter.');
  if (!/\d/.test(value)) problems.push('Include at least one number.');
  if (loginId && value.toLowerCase().includes(String(loginId).toLowerCase())) {
    problems.push('Do not use your login ID inside the password.');
  }
  if (phone && value.includes(String(phone).replace(/\D/g, ''))) {
    problems.push('Do not use your phone number as the password.');
  }
  return problems;
}

export const loginIdProblem = (loginId) => {
  const value = normaliseLoginId(loginId);
  if (!value) return 'Choose a login ID.';
  if (!LOGIN_ID_PATTERN.test(value)) {
    return 'Use 4 to 20 characters: letters, numbers, dot or underscore, starting with a letter.';
  }
  return null;
};
