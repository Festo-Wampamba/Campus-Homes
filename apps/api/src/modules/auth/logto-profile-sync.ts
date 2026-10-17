import { Injectable, Logger } from '@nestjs/common';
import type { PoolClient } from 'pg';

import { RlsDb } from '../../db/db.module';
import { LogtoManagementClient } from './logto-management.client';

/**
 * Keeps Logto's copy of a user in step with ours, so the Logto console shows
 * the full person, not just the sign-in email and name. Our `users` row stays
 * the source of truth; this is a one-way, best-effort copy:
 * - name → Logto `name`
 * - gender, date of birth, address → Logto standard `profile` claims
 * - contact phone, nationality, emergency contact, account type → `customData`
 *
 * The contact phone deliberately goes to customData, never `primaryPhone`:
 * Logto treats primaryPhone as a trusted sign-in identity, and our contact
 * phone is unverified (same reason it isn't users.phone).
 */
export type LogtoProfileRow = {
  logtoUserId: string;
  name: string | null;
  role: string;
  gender: string | null;
  dateOfBirth: string | null;
  address: string | null;
  nationality: string | null;
  contactPhone: string | null;
  emergencyContactName: string | null;
  emergencyContactPhone: string | null;
};

const PROFILE_SELECT = `
  SELECT logto_user_id AS "logtoUserId", name, role::text AS role, gender,
         date_of_birth::text AS "dateOfBirth", address, nationality,
         contact_phone AS "contactPhone", emergency_contact_name AS "emergencyContactName",
         emergency_contact_phone AS "emergencyContactPhone"
  FROM users
  WHERE logto_user_id IS NOT NULL AND deleted_at IS NULL`;

export function toLogtoUserDetails(row: LogtoProfileRow) {
  // ponytail: Logto's partial profile update can't clear a claim, so a value
  // removed here stays in Logto until overwritten. Our DB remains authoritative.
  const profile: Record<string, unknown> = {
    ...(row.gender ? { gender: row.gender } : {}),
    ...(row.dateOfBirth ? { birthdate: row.dateOfBirth } : {}),
    ...(row.address ? { address: { formatted: row.address } } : {}),
  };
  return {
    name: row.name,
    profile,
    customData: {
      accountType: row.role,
      contactPhone: row.contactPhone,
      nationality: row.nationality,
      emergencyContactName: row.emergencyContactName,
      emergencyContactPhone: row.emergencyContactPhone,
    },
  };
}

/** Pushes every linked, non-deleted user. Used by the one-off backfill
 * script; `client` must already carry the service_role RLS context. */
export async function syncAllLogtoProfiles(
  client: PoolClient,
  logto: LogtoManagementClient,
): Promise<{ synced: number; failed: Array<{ logtoUserId: string; error: string }> }> {
  const { rows } = await client.query<LogtoProfileRow>(PROFILE_SELECT);
  const failed: Array<{ logtoUserId: string; error: string }> = [];
  for (const row of rows) {
    try {
      await logto.updateUserDetails(row.logtoUserId, toLogtoUserDetails(row));
    } catch (err) {
      failed.push({ logtoUserId: row.logtoUserId, error: err instanceof Error ? err.message : String(err) });
    }
  }
  return { synced: rows.length - failed.length, failed };
}

@Injectable()
export class LogtoProfileSync {
  private readonly logger = new Logger(LogtoProfileSync.name);

  constructor(
    private readonly rlsDb: RlsDb,
    private readonly logto: LogtoManagementClient,
  ) {}

  /** Fire-and-forget after a profile save: a Logto outage must never fail
   * the user's own save, and the next save (or the backfill) catches up. */
  push(userId: string): void {
    void this.pushNow(userId).catch((err: unknown) => {
      this.logger.warn(`Logto profile sync failed for user ${userId}: ${err instanceof Error ? err.message : String(err)}`);
    });
  }

  private async pushNow(userId: string): Promise<void> {
    const row = await this.rlsDb.run({ userId, role: 'service_role' }, async (_db, client) =>
      (await client.query<LogtoProfileRow>(`${PROFILE_SELECT} AND id = $1`, [userId])).rows[0],
    );
    if (!row) return; // not linked to a Logto identity (yet)
    await this.logto.updateUserDetails(row.logtoUserId, toLogtoUserDetails(row));
  }
}
