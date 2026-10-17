import { BadRequestException } from '@nestjs/common';
import { eq } from 'drizzle-orm';

import type { UpdateSelfParticularsInput } from '@campushomes/shared';

import { RlsDb } from '../../db/db.module';
import type { RlsContext } from '../../db/rls-context';
import { users } from '../../db/schema';
import type { LogtoProfileSync } from '../auth/logto-profile-sync';

// `users` has no self-UPDATE RLS policy — a client-editable row could escalate
// role/status. This runs as service_role and hand-picks only the identity
// fields that carry no privilege; role, status, email, and the sign-in phone never pass
// through here. Shared by both the student and landlord "my profile" routes
// so the allowlist can't drift between the two. Each save is copied to Logto
// (best-effort) so the Logto console shows the same details.
export async function updateSelfParticulars(
  rlsDb: RlsDb,
  ctx: RlsContext,
  input: UpdateSelfParticularsInput,
  logtoSync: LogtoProfileSync,
) {
  const saved = await rlsDb.run({ userId: ctx.userId, role: 'service_role' }, async (db) => {
    // Students and landlords must keep a gender (onboarding requires one), so
    // they can't clear it here; staff may.
    if (input.gender === null) {
      const [current] = await db.select({ role: users.role }).from(users).where(eq(users.id, ctx.userId));
      if (current?.role === 'student' || current?.role === 'landlord') {
        throw new BadRequestException('Choose your gender');
      }
    }
    const [row] = await db
      .update(users)
      .set({
        ...(input.name !== undefined ? { name: input.name } : {}),
        ...(input.dateOfBirth !== undefined ? { dateOfBirth: input.dateOfBirth } : {}),
        ...(input.gender !== undefined ? { gender: input.gender } : {}),
        ...(input.nationality !== undefined ? { nationality: input.nationality } : {}),
        ...(input.address !== undefined ? { address: input.address } : {}),
        ...(input.emergencyContactName !== undefined ? { emergencyContactName: input.emergencyContactName } : {}),
        ...(input.emergencyContactPhone !== undefined ? { emergencyContactPhone: input.emergencyContactPhone } : {}),
        ...(input.contactPhone !== undefined ? { contactPhone: input.contactPhone } : {}),
        updatedAt: new Date(),
      })
      .where(eq(users.id, ctx.userId))
      .returning({
        id: users.id,
        name: users.name,
        dateOfBirth: users.dateOfBirth,
        gender: users.gender,
        nationality: users.nationality,
        address: users.address,
        emergencyContactName: users.emergencyContactName,
        emergencyContactPhone: users.emergencyContactPhone,
        contactPhone: users.contactPhone,
      });
    return row;
  });
  logtoSync.push(ctx.userId);
  return saved;
}
