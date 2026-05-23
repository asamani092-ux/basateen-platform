import type { Env } from "../types";

export async function writeProgAudit(
  env: Env,
  complexId: number,
  entityType: string,
  entityId: number,
  action: string,
  actorUserId: number | null,
  payload?: unknown,
): Promise<void> {
  await env.DB.prepare(
    `INSERT INTO prog_audit_trail (complex_id, entity_type, entity_id, action, payload_json, actor_user_id)
     VALUES (?, ?, ?, ?, ?, ?)`,
  )
    .bind(
      complexId,
      entityType,
      entityId,
      action,
      payload ? JSON.stringify(payload) : null,
      actorUserId,
    )
    .run();
}
