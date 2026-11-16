import { config } from '../config.js';
import { newId, nowIso, run } from '../db/index.js';

/**
 * Notification + OTP delivery.
 *
 * In-app notifications are always stored. Outbound SMS/email needs a provider;
 * until one is connected the message is written to the server log so a real
 * deployment is never silently pretending a message was delivered. Replace the
 * `deliver` function with your provider client and read its credentials from
 * environment variables.
 */

const deliver = async ({ channel, to, message }) => {
  if (config.isProduction && !process.env.SMS_PROVIDER_KEY) {
    console.warn(
      `[notify] No SMS/email provider configured. ${channel} to ${to} was not delivered.`,
    );
    return { delivered: false };
  }
  console.log(`[notify:${channel}] to=${to} :: ${message}`);
  return { delivered: true };
};

export async function notifyOtp(phone, code, testMode) {
  const message = testMode
    ? `ChargeNeighbor test login code for ${phone} is ${code}. Fixed test code — testing only.`
    : `Your ChargeNeighbor verification code is ${code}. It expires in ${config.otp.ttlMinutes} minutes.`;
  return deliver({ channel: 'sms', to: phone, message });
}

export function notify(userId, { kind, title, body = null, link = null }) {
  if (!userId) return null;
  const id = newId();
  run(
    `INSERT INTO notifications (id, user_id, kind, title, body, link, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [id, userId, kind, title, body, link, nowIso()],
  );
  return id;
}

export const notifyBoth = (userIds, payload) => {
  for (const id of userIds.filter(Boolean)) notify(id, payload);
};
