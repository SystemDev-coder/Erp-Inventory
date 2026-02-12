import { queryOne } from '../db/query';

export interface AuditPayload {
  userId: number | null;
  action: string;
  entity?: string | null;
  entityId?: number | null;
  oldValue?: any;
  newValue?: any;
  meta?: any;
  ip?: string | null;
  userAgent?: string | null;
}

/**
 * Write an audit record. Errors are swallowed so business logic is not blocked.
 */
export async function logAudit(payload: AuditPayload) {
  const {
    userId,
    action,
    entity,
    entityId,
    oldValue,
    newValue,
    meta,
    ip,
    userAgent,
  } = payload;

  try {
    await queryOne(
      `INSERT INTO ims.audit_logs (user_id, action, entity, entity_id, old_value, new_value, meta, ip_address, user_agent)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [
        userId ?? null,
        action,
        entity ?? null,
        entityId ?? null,
        oldValue ?? null,
        newValue ?? null,
        meta ?? null,
        ip ?? null,
        userAgent ?? null,
      ]
    );
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('audit log failed:', err);
  }
}
