# ChargeNeighbor

A two-sided marketplace where EV drivers book charging time at residential chargers listed by
neighbours. Built as a modular monolith: **React (JavaScript — no TypeScript) + Vite** on the front,
**Node.js + Express** behind it, **SQLite** (via Node's built-in `node:sqlite`) as the datastore.

> This repository contains a working product, not a demo: there is **no seeded/dummy data**. Every
> charger, booking and review is created by a real account. For testing, a fixed-OTP allowlist lets
> you sign in with test numbers — see [Testing sign-in](#testing-sign-in).

---

## Quick start

```bash
npm run setup      # installs server and client dependencies
cp server/.env.example server/.env
npm run dev        # API on :4000 and web app on :3000
```

Open <http://localhost:3000>.

The database file, the session signing secret and uploaded photos are created on first boot under
`server/data` and `server/uploads`. To start from a clean marketplace, stop the server, delete
`server/data/chargeneighbor.db*` and restart.

**Requirements:** Node.js 22.13 or newer (the app uses the built-in `node:sqlite` module).

### Production build

```bash
npm run build      # builds client/dist
npm start          # Express serves the built app and the API on one port
```

---

## Testing sign-in

There are no fake users in the database. Instead, numbers on an allowlist accept one fixed code,
so you can register real accounts while testing:

```env
TEST_LOGIN_ENABLED=true
TEST_OTP=123456
TEST_PHONE_NUMBERS=+919999000001,+919999000002,+919999000003
TEST_PHONE_PREFIXES=+919999
```

Any number starting with `+919999` signs in with `123456`. Numbers outside the allowlist always get a
real random code, which is never returned by the API. When you finish testing, set
`TEST_LOGIN_ENABLED=false` and restart — the fixed code then stops working immediately and the test
numbers fall back to normal OTP delivery.

Admin access is granted to numbers listed in `ADMIN_PHONES` when they sign in, or to an existing
account with:

```bash
npm run make-admin -- +919876543210
```

### How a host gets verified, and how a listing goes live

Two separate checks, and only one of them is manual:

* **The person** is verified automatically at sign-up by the phone code. Hosting itself needs no
  application or approval — choosing “Host a charger”, or **Become a Host** on `/host`, adds the host
  role and a host profile to the existing account immediately. That is why there is no long “pending”
  wait to start creating a listing.
* **The listing** is reviewed by a human. Saving a draft does not publish anything: the host submits it
  from the editor (or the dashboard), the listing moves to `pending`, and it is hidden from driver
  search until an admin approves it. The admin review queue is **Admin console → Review queue**, which
  lists every `pending` listing with its photos, price and address; **Approve** makes it live in search
  and notifies the host, **Reject** requires a reason that the host sees on the dashboard.

So a listing sitting in `Pending` is waiting on the platform side, not the host’s. Sign in with an
admin account (`ADMIN_PHONES`, `npm run make-admin`, or `+919999000003` in the test allowlist), open
**Admin console** from the account menu → **Review queue** → **Approve**.

### What to try

1. Sign in with `+919999000001` choosing **Host a charger**, create a listing, add a photo, set weekly
   availability, then submit it for review. The checklist above the submit button ticks off exactly
   what the server still needs.
2. Sign in with `+919999000003` (admin) → Admin console → approve the listing.
3. Sign in with `+919999000002` (driver) → Find a Charger → book a slot → open the booking to see the
   address, check-in code and cancellation terms.
4. On the Account page, set a login ID and password for one of these accounts, sign out, and sign back
   in with the **Login ID** tab.

`bash scripts/smoke-test.sh` runs the whole flow against the API (37 assertions). It expects a fresh
database because OTP resend is throttled per number. `bash scripts/restart-dev.sh` stops anything still
holding ports 3000/4000 in this project and starts both servers again.

### Signing in after the first time

Phone verification is how an account is created, but it is not the only way back in. Once signed in,
the **Sign-in details** card on the Account page lets you choose a login ID and a password, and the
login page gains a **Login ID** tab:

* Login ID: 4–20 characters, letters, numbers, dot or underscore, starting with a letter. Stored
  lowercase, so `Ananya.Rao` and `ananya.rao` are the same account.
* Password: at least 8 characters with a letter and a number; stored only as a salted scrypt hash.
* Changing either one later requires the current password.
* Forgot it? Sign in with your phone number, then set a new password — no email or SMS reset needed.
* The phone-code sign-in keeps working, so an account can never be locked out by a lost password.

These rules live in `server/src/lib/credentials.js` and are published through `/api/v1/meta`, so the
form hints and the API validation come from the same numbers.

---

## Architecture

```
client/                      React app (JavaScript)
  src/pages/                 Public, driver, host and admin screens
  src/components/            Design system, layout, listing card, Leaflet map
  src/context/AppContext.jsx Session + runtime config + toasts
server/
  src/config.js              Environment parsing, validation, warnings
  src/config/policies.js     Policy documents AND the numbers booking enforces
  src/db/                    Schema, connection, transactions
  src/lib/                   Auth, OTP, timezone math, geo, errors, audit, notifications
  src/middleware/            Rate limits, same-origin guard, uploads, error handler
  src/services/              Pricing, availability, booking lifecycle, serializers
  src/routes/                auth · users · listings · bookings · host · reports · admin · policies
scripts/                     dev runner and API smoke test
```

API surface is versioned under `/api/v1`. Sessions are JWTs in an `httpOnly`, `SameSite=Lax` cookie;
every state-changing request is additionally checked for same-origin.

---

## Decisions worth knowing

**React with JavaScript.** The original tech-stack notes proposed TypeScript. This implementation is
plain JSX/ESM throughout, as requested. Server code uses ESM `import` with JSDoc where types matter.

**Policies are code, not copy.** `server/src/config/policies.js` holds both the published policy text
and the cancellation windows. `refundPercentForCancellation()` reads the same object the
`/policies` pages render, so the documented refund and the enforced refund cannot drift apart. The
UI fetches `/api/v1/policies` rather than duplicating text.

**Address privacy is enforced server-side.** Public listing responses never include the street address
or access notes, and map pins are deterministically shifted by a few hundred metres (stable per
listing, never the real coordinates). A booking response includes the address only when the viewer is
the booked driver, the host, or an admin.

**Double bookings are prevented in the database.** Slot generation is a convenience; the authoritative
check runs inside a `BEGIN IMMEDIATE` transaction immediately before insert. Two drivers cannot hold
the same exclusive slot, and the loser gets a `409` with a field-level message.

**No fake payment success.** `PAYMENTS_MODE=offline` (the default) means no payment provider is
connected: bookings are confirmed, the payment record is `DUE_AT_SESSION`, and every screen says so.
`server/src/services/payments` is the seam for a real provider — webhooks must be verified and
idempotent before any booking is treated as paid.

**No fabricated estimates.** Sessions are priced per hour, never per kWh, because home chargers are not
metered for billing here. The product does not promise arrival battery percentages.

**Verification is described accurately.** Phone verification, listing review and electrical safety are
three different claims. Badges say which one applies; listing review is explicitly *not* an
inspection.

**No notification provider yet.** In-app notifications are stored in the database. Outbound SMS logs to
the server console in development and logs a warning in production when no provider is configured —
it never pretends a message was delivered.

---

## Error handling

* One error shape everywhere: `{ "error": { "code", "message", "details" } }`.
* Validation failures return `422` with `details: [{ field, message }]`, which forms render inline and
  screen readers announce.
* Loading, empty and error states exist on every data screen, with a retry action.
* A React error boundary catches render failures; the API has a final JSON 404 for unknown routes and
  a central handler that hides stack traces in production.
* Rate limits: 240 req/min general, 40 per 10 min on auth, 60 per min on writes, plus a per-number OTP
  resend cooldown and attempt cap.
* SQLite errors (unique constraints, foreign keys) are translated into readable responses.

---

## Environment

| Variable | Default | Purpose |
| --- | --- | --- |
| `PORT` | `4000` | API port |
| `JWT_SECRET` | generated in dev | Session signing key — **required** in production |
| `DATA_DIR` | `./data` | SQLite database + dev secret |
| `PLATFORM_FEE_PERCENT` | `8` | Service fee added to the host rate |
| `DEFAULT_TIMEZONE` | `Asia/Kolkata` | Fallback timezone for availability |
| `MIN_LEAD_MINUTES` | `30` | Earliest bookable start time |
| `SLOT_STEP_MINUTES` | `30` | Slot grid granularity |
| `PAYMENTS_MODE` | `offline` | `offline` until a provider is connected |
| `TRUST_PROXY` | `0` (dev) / `1` (prod) | Proxy hops, for correct rate-limit IPs |
| `ADMIN_PHONES` | empty | Numbers that receive the admin role on sign-in |
| `TEST_LOGIN_ENABLED` / `TEST_OTP` / `TEST_PHONE_*` | on in dev | Fixed-code testing sign-in |
| `SMS_PROVIDER_KEY` | empty | Presence gates real outbound delivery |

Never commit `server/.env`. The dev signing secret and database are gitignored.

---

## Deliberately not built yet

Payments and host payouts, SMS/email delivery, identity-document verification, automated availability
sync, energy metering (OCPP), and the route/battery estimate. Each needs a provider decision or a
policy decision, and stubbing them would put claims in the product that the platform cannot honour.
