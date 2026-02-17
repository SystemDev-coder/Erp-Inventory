import { queryMany, queryOne } from '../db/query';

export interface AuditPayload {
  userId: number | null;
  action: string;
  entity?: string | null;
  entityId?: number | null;
  branchId?: number | null;
  oldValue?: unknown;
  newValue?: unknown;
  ip?: string | null;
  userAgent?: string | null;
}

const toActionType = (action: string) => {
  if (action.includes('.')) {
    return action.split('.')[0] || action;
  }
  return action;
};

type AuditInsertMode = 'new' | 'legacy';
let auditInsertMode: AuditInsertMode | null = null;

const detectAuditMode = async (): Promise<AuditInsertMode> => {
  if (auditInsertMode) return auditInsertMode;

  const columns = await queryMany<{ column_name: string }>(
    `SELECT column_name
       FROM information_schema.columns
      WHERE table_schema = 'ims'
        AND table_name = 'audit_logs'`
  );
  const names = new Set(columns.map((row) => row.column_name));

  auditInsertMode = names.has('action_type') ? 'new' : 'legacy';
  return auditInsertMode;
};

const insertNewAuditRow = async (payload: AuditPayload) => {
  await queryOne(
    `INSERT INTO ims.audit_logs
       (branch_id, user_id, action_type, table_name, record_id, old_values, new_values, ip_address, user_agent)
     VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7::jsonb, $8, $9)`,
    [
      payload.branchId ?? null,
      payload.userId ?? null,
      toActionType(payload.action),
      payload.entity ?? null,
      payload.entityId ?? null,
      payload.oldValue ? JSON.stringify(payload.oldValue) : null,
      payload.newValue ? JSON.stringify(payload.newValue) : null,
      payload.ip ?? null,
      payload.userAgent ?? null,
    ]
  );
};

const insertLegacyAuditRow = async (payload: AuditPayload) => {
  await queryOne(
    `INSERT INTO ims.audit_logs
       (user_id, action, entity, entity_id, old_value, new_value, ip_address, user_agent)
     VALUES ($1, $2, $3, $4, $5::jsonb, $6::jsonb, $7, $8)`,
    [
      payload.userId ?? null,
      payload.action,
      payload.entity ?? null,
      payload.entityId ?? null,
      payload.oldValue ? JSON.stringify(payload.oldValue) : null,
      payload.newValue ? JSON.stringify(payload.newValue) : null,
      payload.ip ?? null,
      payload.userAgent ?? null,
    ]
  );
};

export async function logAudit(payload: AuditPayload) {
  try {
    const detectedMode = await detectAuditMode();
    const candidateModes: AuditInsertMode[] = [
      detectedMode,
      detectedMode === 'new' ? 'legacy' : 'new',
    ];

    let lastError: any = null;
    for (const mode of candidateModes) {
      try {
        if (mode === 'new') {
          await insertNewAuditRow(payload);
        } else {
          await insertLegacyAuditRow(payload);
        }
        auditInsertMode = mode;
        return;
      } catch (error: any) {
        lastError = error;
        if (error?.code !== '42703') {
          throw error;
        }
      }
    }

    if (lastError) {
      throw lastError;
    }
    if (detectedMode === 'new') {
      await insertNewAuditRow(payload);
    } else {
      await insertLegacyAuditRow(payload);
    }
  } catch (error) {
    console.error('audit log failed:', error);
  }
}
