import { Injectable } from '@nestjs/common';

import type { RlsContext } from '../../db/rls-context';
import { RlsDb } from '../../db/db.module';
import { auditLog } from '../../db/schema';

/** Brief §17: every Ops mutation, payment state transition, strike and refund
 * writes here. Inserts run as service_role (append-only; leads read via RLS). */
@Injectable()
export class AuditService {
  constructor(private readonly rlsDb: RlsDb) {}

  record(
    actor: RlsContext,
    action: string,
    targetType: string,
    targetId: string,
    payload: Record<string, unknown>,
    ipAddress?: string,
  ): Promise<void> {
    return this.rlsDb.run({ userId: actor.userId, role: 'service_role' }, async (db) => {
      await db.insert(auditLog).values({
        actorId: actor.userId,
        actorRole: actor.role,
        action,
        targetType,
        targetId,
        payload,
        ipAddress,
      });
    });
  }
}
