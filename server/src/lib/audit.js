import { newId, nowIso, run } from '../db/index.js';

/** Records a security-relevant action. Never throws into the request path. */
export function audit({ actorId = null, action, entityType = null, entityId = null, meta = null, ip = null }) {
  try {
    run(
      `INSERT INTO audit_logs (id, actor_id, action, entity_type, entity_id, meta, ip, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [newId(), actorId, action, entityType, entityId, meta ? JSON.stringify(meta) : null, ip, nowIso()],
    );
  } catch (error) {
    console.error('[audit] failed to record event', action, error.message);
  }
}
