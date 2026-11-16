/**
 * Grants the admin role to an existing account.
 *   npm run make-admin -- +919876543210
 * Admin accounts get the listing review queue and support tools.
 */
import { one, parseRoles, run } from '../src/db/index.js';

const phone = (process.argv[2] || '').replace(/[\s\-()]/g, '').trim();

if (!phone) {
  console.error('Usage: npm run make-admin -- +91XXXXXXXXXX');
  process.exit(1);
}

const user = one('SELECT * FROM users WHERE phone = ?', [phone]);
if (!user) {
  console.error(`No account found for ${phone}. Sign in once, then run this again.`);
  process.exit(1);
}

const roles = parseRoles(user.roles);
if (!roles.includes('admin')) {
  roles.push('admin');
  run('UPDATE users SET roles = ?, updated_at = ? WHERE id = ?', [
    roles.join(','),
    new Date().toISOString(),
    user.id,
  ]);
}

console.log(`${user.name || user.phone} now has roles: ${roles.join(', ')}`);
