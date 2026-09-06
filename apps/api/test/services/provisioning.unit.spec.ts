import { ConflictException } from '@nestjs/common';
import type { PoolClient } from 'pg';

import { RlsDb } from '../../src/db/db.module';
import { ProvisioningService } from '../../src/modules/auth/provisioning.service';

type Row = Record<string, unknown>;

function fixture(options: {
  linked?: Row;
  candidates?: Row[];
  staffAccess?: boolean;
} = {}) {
  const calls: Array<{ sql: string; params: unknown[] }> = [];
  let createdParams: unknown[] | undefined;
  const client = {
    query: jest.fn(async (text: string, params: unknown[] = []) => {
      const sql = text.replace(/\s+/g, ' ').trim();
      calls.push({ sql, params });
      if (sql.includes('pg_advisory_xact_lock')) return { rows: [] };
      if (sql.includes('FROM auth_invitations')) return { rows: [] };
      if (sql.includes('WHERE logto_user_id = $1 FOR UPDATE')) {
        return { rows: options.linked ? [options.linked] : [] };
      }
      if (sql.includes('logto_user_id AS "logtoUserId"')) {
        return { rows: options.candidates ?? [] };
      }
      if (sql.startsWith('UPDATE users SET logto_user_id')) {
        const candidate = options.candidates?.[0];
        return { rows: candidate ? [{ ...candidate, logtoUserId: undefined }] : [] };
      }
      if (sql.startsWith('INSERT INTO users')) {
        createdParams = params;
        return { rows: [{ id: params[0], role: params[5], status: 'active', deletedAt: null }] };
      }
      if (sql.startsWith('SELECT id FROM users WHERE deleted_at IS NULL')) return { rows: [] };
      if (sql.startsWith('SELECT id, status, deleted_at') && sql.includes('FROM users')) {
        return { rows: [{ id: params[0], status: 'active', deletedAt: null }] };
      }
      if (sql.startsWith('SELECT id FROM roles')) return { rows: [{ id: 'role-id' }] };
      if (sql.startsWith('UPDATE user_role_assignments')) return { rows: [] };
      if (sql.includes('FROM user_role_assignments WHERE user_id')) return { rows: [] };
      if (sql.startsWith('INSERT INTO user_role_assignments')) {
        return { rows: [{ id: 'assignment-id', userId: params[0], scopeType: params[2], scopeId: params[3] }] };
      }
      if (sql.startsWith('INSERT INTO audit_log')) return { rows: [] };
      if (sql.startsWith('SELECT 1 FROM user_role_assignments')) {
        return { rows: options.staffAccess ? [{ '?column?': 1 }] : [] };
      }
      throw new Error(`Unexpected query: ${sql}`);
    }),
  } as unknown as PoolClient;
  const rls = {
    run: async (_ctx: unknown, fn: (_db: unknown, client: PoolClient) => unknown) => fn({}, client),
  } as RlsDb;
  return {
    service: new ProvisioningService(rls),
    calls,
    createdParams: () => createdParams,
  };
}

describe('provisioning identity boundaries', () => {
  it('records provider verification separately from contact presence', async () => {
    const { service, createdParams } = fixture();
    await service.provision({ sub: 'new-sub', email: 'unverified@example.com' }, 'consumer');
    expect(createdParams()?.[7]).toBe(false);
  });

  it('does not use an unverified contact to link a legacy account', async () => {
    const { service, calls } = fixture({
      candidates: [{ id: 'legacy', role: 'landlord', status: 'active', deletedAt: null, logtoUserId: null }],
    });
    const result = await service.provision(
      { sub: 'new-sub', email: 'legacy@example.com', emailVerified: false },
      'consumer',
    );
    expect(result?.role).toBe('student');
    expect(calls.some(({ sql }) => sql.includes('logto_user_id AS "logtoUserId"'))).toBe(false);
  });

  it('rejects verified contacts that identify different local accounts', async () => {
    const { service } = fixture({
      candidates: [
        { id: 'email-user', role: 'student', status: 'active', deletedAt: null, logtoUserId: null },
        { id: 'phone-user', role: 'landlord', status: 'active', deletedAt: null, logtoUserId: null },
      ],
    });
    await expect(service.provision({
      sub: 'new-sub', email: 'one@example.com', emailVerified: true,
      phoneNumber: '+256700000001', phoneVerified: true,
    }, 'consumer')).rejects.toBeInstanceOf(ConflictException);
  });

  it('does not admit an existing consumer identity into staff without an active assignment', async () => {
    const { service } = fixture({
      linked: { id: 'student', role: 'student', status: 'active', deletedAt: null },
    });
    expect(await service.provision({ sub: 'linked-student' }, 'staff')).toBeNull();
  });

  it('admits staff based on an active assignment rather than users.role', async () => {
    const { service } = fixture({
      linked: { id: 'mixed-user', role: 'student', status: 'active', deletedAt: null },
      staffAccess: true,
    });
    expect(await service.provision({ sub: 'mixed-user' }, 'staff')).toEqual({
      id: 'mixed-user', role: 'student', status: 'active',
    });
  });

  it('returns pending consumer accounts so the callback can show account state', async () => {
    const { service } = fixture({
      linked: { id: 'pending', role: 'landlord', status: 'pending', deletedAt: null },
    });
    expect(await service.provision({ sub: 'pending-sub' }, 'consumer')).toEqual({
      id: 'pending', role: 'landlord', status: 'pending',
    });
  });

  it('rejects suspended accounts', async () => {
    const { service } = fixture({
      linked: { id: 'blocked', role: 'student', status: 'suspended', deletedAt: null },
    });
    expect(await service.provision({ sub: 'blocked-sub' }, 'consumer')).toBeNull();
  });
});
