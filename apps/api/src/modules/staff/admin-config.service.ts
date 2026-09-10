import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';

import type {
  CreateIntegrationInput,
  CreateSemesterInput,
  PlatformSettingsUpdateInput,
  UpdateIntegrationInput,
  UpdateSemesterInput,
} from '@campushomes/shared';
import { createSemesterSchema } from '@campushomes/shared';

import { RlsDb } from '../../db/db.module';
import type { RlsContext } from '../../db/rls-context';
import { AuditService } from '../ops/audit.service';

const SERVICE_CTX: RlsContext = {
  userId: '00000000-0000-0000-0000-000000000000',
  role: 'service_role',
};

// audit_log target IDs are UUIDs while platform settings are keyed by text.
// This stable virtual-resource ID represents the singleton settings collection.
const PLATFORM_SETTINGS_AUDIT_ID = '00000000-0000-0000-0000-000000000001';

const SETTING_KEYS: Record<keyof PlatformSettingsUpdateInput, string> = {
  reservationHoldHours: 'reservation_hold_hours',
  reservationFeeUgx: 'reservation_fee_ugx',
  verificationValidMonths: 'verification_valid_months',
  registrationsOpen: 'registrations_open',
  maintenanceMode: 'maintenance_mode',
  reportRetentionDays: 'report_retention_days',
  supportContact: 'support_contact',
};

function semesterName(input: CreateSemesterInput): string {
  const label = input.semesterType === 'custom'
    ? input.customName!
    : `Semester ${input.semesterType.slice(-1)}`;
  return `${label} · ${input.university} · ${input.academicYear}`;
}

@Injectable()
export class AdminConfigService {
  constructor(
    private readonly rlsDb: RlsDb,
    private readonly audit: AuditService,
  ) {}

  async updateSettings(actor: RlsContext, input: PlatformSettingsUpdateInput) {
    const entries = Object.entries(input) as [keyof PlatformSettingsUpdateInput, unknown][];
    if (!entries.length) throw new BadRequestException('No setting changes were provided');
    const rows = await this.rlsDb.run(SERVICE_CTX, async (_db, client) => {
      await client.query('BEGIN');
      try {
        const updated = [];
        for (const [field, value] of entries) {
          const key = SETTING_KEYS[field];
          const row = (await client.query(`
            UPDATE platform_settings SET value = $2::jsonb, updated_by = $3, updated_at = now()
            WHERE key = $1 RETURNING key, value, description, updated_at AS "updatedAt"
          `, [key, JSON.stringify(value), actor.userId])).rows[0];
          if (!row) throw new NotFoundException(`Setting ${key} is not initialized`);
          updated.push(row);
        }
        await client.query('COMMIT');
        return updated;
      } catch (error) {
        await client.query('ROLLBACK').catch(() => undefined);
        throw error;
      }
    });
    await this.audit.record(actor, 'settings.update', 'platform_settings', PLATFORM_SETTINGS_AUDIT_ID, {
      fields: entries.map(([field]) => field),
    });
    return { rows };
  }

  async createSemester(actor: RlsContext, input: CreateSemesterInput) {
    const name = semesterName(input);
    const row = await this.rlsDb.run(SERVICE_CTX, async (_db, client) => {
      try {
        return (await client.query(`
          INSERT INTO semesters (
            name, university, semester_type, academic_year, custom_name,
            starts_on, ends_on, re_verification_window_starts_on
          )
          VALUES ($1, $2::university, $3, $4, $5, $6, $7, $8)
          RETURNING id, name, university::text, semester_type AS "semesterType",
                    academic_year AS "academicYear", custom_name AS "customName",
                    starts_on::text AS "startsOn", ends_on::text AS "endsOn",
                    re_verification_window_starts_on::text AS "reVerificationWindowStartsOn"
        `, [
          name, input.university, input.semesterType, input.academicYear,
          input.semesterType === 'custom' ? input.customName : null, input.startsOn, input.endsOn,
          input.reVerificationWindowStartsOn,
        ])).rows[0]!;
      } catch (error) {
        if ((error as { code?: string }).code === '23505') throw new ConflictException('That semester already exists');
        throw error;
      }
    });
    await this.audit.record(actor, 'semesters.create', 'semester', String(row.id), {
      name,
      university: input.university,
      academicYear: input.academicYear,
      semesterType: input.semesterType,
    });
    return row;
  }

  async updateSemester(actor: RlsContext, semesterId: string, input: UpdateSemesterInput) {
    if (!Object.keys(input).length) throw new BadRequestException('No semester changes were provided');
    const row = await this.rlsDb.run(SERVICE_CTX, async (_db, client) => {
      await client.query('BEGIN');
      try {
        const current = (await client.query(`
          SELECT university::text, semester_type AS "semesterType",
                 academic_year AS "academicYear", custom_name AS "customName",
                 starts_on::text AS "startsOn", ends_on::text AS "endsOn",
                 re_verification_window_starts_on::text AS "reVerificationWindowStartsOn"
          FROM semesters WHERE id = $1 FOR UPDATE
        `, [semesterId])).rows[0];
        if (!current) throw new NotFoundException('Semester not found');
        const parsed = createSemesterSchema.safeParse({ ...current, ...input });
        if (!parsed.success) {
          throw new BadRequestException(parsed.error.issues[0]?.message ?? 'Invalid semester details');
        }
        const next = parsed.data;
        const updated = (await client.query(`
          UPDATE semesters SET name = $2, university = $3::university,
            semester_type = $4, academic_year = $5, custom_name = $6,
            starts_on = $7, ends_on = $8, re_verification_window_starts_on = $9
          WHERE id = $1
          RETURNING id, name, university::text, semester_type AS "semesterType",
                    academic_year AS "academicYear", custom_name AS "customName",
                    starts_on::text AS "startsOn", ends_on::text AS "endsOn",
                    re_verification_window_starts_on::text AS "reVerificationWindowStartsOn"
        `, [
          semesterId, semesterName(next), next.university, next.semesterType,
          next.academicYear, next.semesterType === 'custom' ? next.customName : null, next.startsOn, next.endsOn,
          next.reVerificationWindowStartsOn,
        ])).rows[0];
        await client.query('COMMIT');
        return updated;
      } catch (error) {
        await client.query('ROLLBACK').catch(() => undefined);
        if ((error as { code?: string }).code === '23505') throw new ConflictException('That semester already exists');
        throw error;
      }
    });
    await this.audit.record(actor, 'semesters.update', 'semester', semesterId, { fields: Object.keys(input) });
    return row;
  }

  async deleteSemester(actor: RlsContext, semesterId: string) {
    const row = await this.rlsDb.run(SERVICE_CTX, async (_db, client) => {
      const used = Number((await client.query(`
        SELECT (
          (SELECT count(*) FROM listings WHERE semester_id = $1) +
          (SELECT count(*) FROM unit_semester_pricing WHERE semester_id = $1)
        ) AS count
      `, [semesterId])).rows[0]?.count ?? 0);
      if (used) throw new ConflictException('A semester used by listings or units cannot be deleted');
      const archived = (await client.query(`
        UPDATE semesters SET archived_at = now()
        WHERE id = $1 AND archived_at IS NULL
        RETURNING id, name
      `, [semesterId])).rows[0];
      if (!archived) throw new NotFoundException('Semester not found');
      return archived;
    });
    await this.audit.record(actor, 'semesters.archive', 'semester', semesterId, { name: row.name });
    return { id: semesterId, archived: true };
  }

  async createIntegration(actor: RlsContext, input: CreateIntegrationInput) {
    const row = await this.rlsDb.run(SERVICE_CTX, async (_db, client) => {
      try {
        return (await client.query(`
          INSERT INTO platform_integrations (
            key, name, purpose, category, audience, base_url, enabled, config, created_by, updated_by
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb, $9, $9)
          RETURNING id, key, name, purpose, category, audience, base_url AS "baseUrl",
                    enabled, is_system AS "isSystem", config
        `, [
          input.key, input.name, input.purpose, input.category, input.audience,
          input.baseUrl || null, input.enabled, JSON.stringify(input.config), actor.userId,
        ])).rows[0]!;
      } catch (error) {
        if ((error as { code?: string }).code === '23505') throw new ConflictException('An integration with that key already exists');
        throw error;
      }
    });
    await this.audit.record(actor, 'integrations.create', 'integration', String(row.id), { key: input.key });
    return row;
  }

  async updateIntegration(actor: RlsContext, integrationId: string, input: UpdateIntegrationInput) {
    const mapping: Record<string, { column: string; json?: boolean }> = {
      name: { column: 'name' }, purpose: { column: 'purpose' }, category: { column: 'category' },
      audience: { column: 'audience' }, baseUrl: { column: 'base_url' }, enabled: { column: 'enabled' },
      config: { column: 'config', json: true },
    };
    const values: unknown[] = [];
    const sets: string[] = [];
    for (const [field, definition] of Object.entries(mapping)) {
      const value = input[field as keyof UpdateIntegrationInput];
      if (value === undefined) continue;
      values.push(definition.json ? JSON.stringify(value) : value === '' ? null : value);
      sets.push(`${definition.column} = $${values.length + 1}${definition.json ? '::jsonb' : ''}`);
    }
    if (!sets.length) throw new BadRequestException('No integration changes were provided');
    const row = await this.rlsDb.run(SERVICE_CTX, async (_db, client) => {
      const updated = (await client.query(`
        UPDATE platform_integrations SET ${sets.join(', ')}, updated_by = $${values.length + 2}, updated_at = now()
        WHERE id = $1
        RETURNING id, key, name, purpose, category, audience, base_url AS "baseUrl",
                  enabled, is_system AS "isSystem", config
      `, [integrationId, ...values, actor.userId])).rows[0];
      if (!updated) throw new NotFoundException('Integration not found');
      return updated;
    });
    await this.audit.record(actor, 'integrations.update', 'integration', integrationId, { fields: Object.keys(input) });
    return row;
  }

  async deleteIntegration(actor: RlsContext, integrationId: string) {
    const row = await this.rlsDb.run(SERVICE_CTX, async (_db, client) => {
      const integration = (await client.query(
        'SELECT id, key, is_system AS "isSystem" FROM platform_integrations WHERE id = $1',
        [integrationId],
      )).rows[0];
      if (!integration) throw new NotFoundException('Integration not found');
      if (integration.isSystem) throw new ForbiddenException('System integrations can be disabled but not deleted');
      await client.query('DELETE FROM platform_integrations WHERE id = $1', [integrationId]);
      return integration;
    });
    await this.audit.record(actor, 'integrations.delete', 'integration', integrationId, { key: row.key });
    return { id: integrationId, deleted: true };
  }
}
