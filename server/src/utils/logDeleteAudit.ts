import { AuthRequest } from '../middlewares/requireAuth';
import { logAudit } from './audit';

export const logDeleteAudit = async (
  req: AuthRequest,
  entity: string,
  entityId: number | null,
  extra?: Record<string, unknown>
) => {
  await logAudit({
    userId: req.user?.userId ?? null,
    action: 'delete',
    entity,
    entityId,
    ip: req.ip,
    userAgent: req.get('user-agent') || null,
    newValue: {
      reason: req.deleteReason ?? null,
      ...extra,
    },
  });
};
