import type { MutationCtx } from '../_generated/server';
import type { Id } from '../_generated/dataModel';
import type { AuditAction } from './auditActions';

export async function recordAudit(
  ctx: MutationCtx,
  entry: {
    actorId?: Id<'users'>;
    action: AuditAction;
    targetId?: string;
    metadata?: unknown;
  },
) {
  await ctx.db.insert('auditLog', {
    actorId: entry.actorId,
    action: entry.action,
    targetId: entry.targetId,
    metadata: entry.metadata,
    createdAt: Date.now(),
  });
}
