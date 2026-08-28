import { Injectable } from '@nestjs/common';

import type { CreateOnboardingLeadInput } from '@campushomes/shared';

import type { RlsContext } from '../../db/rls-context';
import { RlsDb } from '../../db/db.module';
import { onboardingLeads } from '../../db/schema';

// No client-derived identity exists yet at this point — a prospective
// landlord filling this form has no account — so this is the one place in
// the app where an unauthenticated write is legitimate, and it has to run
// as service_role (onboarding_leads' only RLS policy admitting INSERT).
const SERVICE_CTX: RlsContext = {
  userId: '00000000-0000-0000-0000-000000000000',
  role: 'service_role',
};

@Injectable()
export class LeadsService {
  constructor(private readonly rlsDb: RlsDb) {}

  create(input: CreateOnboardingLeadInput) {
    return this.rlsDb.run(SERVICE_CTX, async (db) => {
      const [lead] = await db
        .insert(onboardingLeads)
        .values({
          name: input.name,
          phone: input.phone,
          email: input.email || null,
          propertyLocation: input.propertyLocation,
          message: input.message || null,
        })
        .returning();
      return lead;
    });
  }
}
