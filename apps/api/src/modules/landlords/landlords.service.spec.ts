import { ForbiddenException } from '@nestjs/common';
import type { PoolClient } from 'pg';

import { RlsDb } from '../../db/db.module';
import type { RlsContext } from '../../db/rls-context';
import { AuditService } from '../ops/audit.service';
import { LandlordsService } from './landlords.service';

const actor: RlsContext = { userId: '11111111-1111-4111-8111-111111111111', role: 'student' };

function fixture(status = 'active', existingAssignment = false) {
  const queries: Array<{ sql: string; params: unknown[] }> = [];
  const client = {
    query: jest.fn(async (text: string, params: unknown[] = []) => {
      const sql = text.replace(/\s+/g, ' ').trim();
      queries.push({ sql, params });
      if (sql.startsWith('SELECT id, status::text')) {
        return { rows: [{ id: actor.userId, status, deletedAt: null }] };
      }
      if (sql.startsWith('SELECT id, status, deleted_at')) {
        return { rows: [{ id: actor.userId, status, deletedAt: null }] };
      }
      if (sql.startsWith('SELECT id FROM roles')) return { rows: [{ id: 'landlord-role' }] };
      if (sql.startsWith('UPDATE user_role_assignments')) return { rows: [] };
      if (sql.includes('FROM user_role_assignments WHERE user_id')) {
        return { rows: existingAssignment ? [{ id: 'existing', userId: actor.userId, scopeType: 'own', scopeId: null }] : [] };
      }
      if (sql.startsWith('INSERT INTO user_role_assignments')) {
        return { rows: [{ id: 'created', userId: actor.userId, scopeType: 'own', scopeId: null }] };
      }
      if (sql.startsWith('INSERT INTO audit_log')) return { rows: [] };
      throw new Error(`Unexpected query: ${sql}`);
    }),
  } as unknown as PoolClient;
  const rlsDb = {
    run: async (_ctx: unknown, fn: (_db: unknown, client: PoolClient) => unknown) => fn({}, client),
  } as RlsDb;
  const service = new LandlordsService(rlsDb, {} as AuditService);
  return { service, queries };
}

describe('LandlordsService.enroll', () => {
  it('adds a self-scoped landlord assignment without rewriting users.role', async () => {
    const { service, queries } = fixture();
    await expect(service.enroll(actor)).resolves.toMatchObject({
      enrolled: true,
      assignmentId: 'created',
      onboardingPath: '/landlord/onboarding',
    });
    expect(queries.some(({ sql }) => /^UPDATE users\b/.test(sql))).toBe(false);
    const insert = queries.find(({ sql }) => sql.startsWith('INSERT INTO user_role_assignments'));
    expect(insert?.params).toEqual([
      actor.userId,
      'landlord-role',
      'own',
      null,
      null,
      actor.userId,
      'Self-service landlord enrollment',
    ]);
  });

  it('is idempotent when landlord access already exists', async () => {
    const { service, queries } = fixture('active', true);
    await expect(service.enroll(actor)).resolves.toMatchObject({ assignmentId: 'existing' });
    expect(queries.some(({ sql }) => sql.startsWith('INSERT INTO user_role_assignments'))).toBe(false);
  });

  it('rejects an inactive account', async () => {
    const { service } = fixture('suspended');
    await expect(service.enroll(actor)).rejects.toBeInstanceOf(ForbiddenException);
  });
});
