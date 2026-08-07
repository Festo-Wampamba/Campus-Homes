import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { asc, eq } from 'drizzle-orm';

import type { CreateLedgerAccountInput, UpdateLedgerAccountInput } from '@campushomes/shared';

import { RlsDb } from '../../db/db.module';
import type { RlsContext } from '../../db/rls-context';
import { ledgerAccounts } from '../../db/schema';

const SERVICE_CTX: RlsContext = {
  userId: '00000000-0000-0000-0000-000000000000',
  role: 'service_role',
};

// ledger_accounts is svc_all-only under RLS (0018) — PermissionsGuard
// (finance.read/finance.manage) is the real authorization boundary.
@Injectable()
export class FinanceAccountsService {
  constructor(private readonly rlsDb: RlsDb) {}

  list() {
    return this.rlsDb.run(SERVICE_CTX, (db) =>
      db.select().from(ledgerAccounts).orderBy(asc(ledgerAccounts.code)),
    );
  }

  async create(input: CreateLedgerAccountInput) {
    return this.rlsDb.run(SERVICE_CTX, async (db) => {
      if (input.parentId) {
        const [parent] = await db.select().from(ledgerAccounts).where(eq(ledgerAccounts.id, input.parentId));
        if (!parent) throw new NotFoundException('Parent account not found');
        if (parent.accountType !== input.accountType) {
          throw new BadRequestException(
            `A sub-account of "${parent.name}" must also be type ${parent.accountType}`,
          );
        }
      }
      const [row] = await db
        .insert(ledgerAccounts)
        .values({
          code: input.code,
          name: input.name,
          accountType: input.accountType,
          parentId: input.parentId ?? null,
          description: input.description ?? null,
        })
        .returning();
      return row;
    });
  }

  async update(id: string, input: UpdateLedgerAccountInput) {
    return this.rlsDb.run(SERVICE_CTX, async (db) => {
      const [account] = await db.select().from(ledgerAccounts).where(eq(ledgerAccounts.id, id));
      if (!account) throw new NotFoundException('Account not found');
      if (input.isActive === false && account.isSystem) {
        throw new ForbiddenException('A system account cannot be deactivated — it is required by auto-posting');
      }
      const [row] = await db
        .update(ledgerAccounts)
        .set({
          ...(input.name !== undefined ? { name: input.name } : {}),
          ...(input.description !== undefined ? { description: input.description } : {}),
          ...(input.isActive !== undefined ? { isActive: input.isActive } : {}),
          updatedAt: new Date(),
        })
        .where(eq(ledgerAccounts.id, id))
        .returning();
      return row;
    });
  }
}
