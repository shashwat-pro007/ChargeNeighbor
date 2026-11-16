import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { config } from '../config.js';

const schemaPath = path.join(path.dirname(new URL(import.meta.url).pathname), 'schema.sql');

const db = new DatabaseSync(config.dbFile);

db.exec('PRAGMA journal_mode = WAL');
db.exec('PRAGMA foreign_keys = ON');
db.exec('PRAGMA busy_timeout = 5000');

const schema = fs.readFileSync(schemaPath, 'utf8');
db.exec(schema);

/**
 * Last-resort guard for existing databases: CREATE TABLE IF NOT EXISTS leaves
 * older tables untouched, so columns added later are patched in here.
 */
function ensureColumn(table, column, definition) {
  const columns = db.prepare(`PRAGMA table_info(${table})`).all();
  if (!columns.some((item) => item.name === column)) {
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
  }
}

ensureColumn('users', 'login_id', 'TEXT');
ensureColumn('users', 'password_hash', 'TEXT');
db.exec('CREATE UNIQUE INDEX IF NOT EXISTS idx_users_login_id ON users (login_id)');

export { db };

export const nowIso = () => new Date().toISOString();
export const newId = () => crypto.randomUUID();

/** Run a synchronous transaction; rolls back and rethrows on any error. */
export function transaction(fn) {
  db.exec('BEGIN IMMEDIATE');
  try {
    const result = fn();
    db.exec('COMMIT');
    return result;
  } catch (error) {
    try {
      db.exec('ROLLBACK');
    } catch {
      // ignore rollback failures, the original error is more useful
    }
    throw error;
  }
}

export const one = (sql, params = []) => db.prepare(sql).get(...params) ?? null;
export const all = (sql, params = []) => db.prepare(sql).all(...params);
export const run = (sql, params = []) => db.prepare(sql).run(...params);

export function parseRoles(rolesField) {
  return String(rolesField ?? '')
    .split(',')
    .map((role) => role.trim())
    .filter(Boolean);
}

export function serializeUser(row, { includeRoles = true } = {}) {
  if (!row) return null;
  const user = {
    id: row.id,
    phone: row.phone,
    name: row.name ?? null,
    email: row.email ?? null,
    status: row.status,
    loginId: row.login_id ?? null,
    hasPassword: Boolean(row.password_hash),
    phoneVerified: Boolean(row.phone_verified_at),
    phoneVerifiedAt: row.phone_verified_at ?? null,
    createdAt: row.created_at,
  };
  if (includeRoles) user.roles = parseRoles(row.roles);
  return user;
}
