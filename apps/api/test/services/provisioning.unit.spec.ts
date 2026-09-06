import { RlsDb } from '../../src/db/db.module';
import { ProvisioningService } from '../../src/modules/auth/provisioning.service';

// Isolated: never open a connection or load the shared development database.
function fixture(linked: object[] = []) {
  const writes: Record<string, unknown>[] = [];
  const db = {
    select: () => ({ from: () => ({ where: async () => linked }) }),
    insert: () => ({ values: (value: Record<string, unknown>) => {
      writes.push(value);
      return { returning: async () => [{ id: 'new-user', role: 'student', status: 'active' }] };
    } }),
  };
  const rls = { run: async (_ctx: unknown, fn: (db: unknown) => unknown) => fn(db) } as RlsDb;
  return { service: new ProvisioningService(rls), writes };
}

describe('provisioning identity boundaries', () => {
  it('does not mark an unverified provider contact verified', async () => {
    const { service, writes } = fixture();
    await service.provision({ sub: 'new-sub', email: 'unverified@example.com' }, 'consumer');
    expect(writes[0]?.emailVerified).toBe(false);
  });

  it('does not admit an existing consumer identity into staff', async () => {
    const { service } = fixture([{ id: 'student', role: 'student', status: 'active' }]);
    expect(await service.provision({ sub: 'linked-student' }, 'staff')).toBeNull();
  });

  it.each(['suspended', 'pending'])('does not provision a %s account', async (status) => {
    const { service } = fixture([{ id: 'blocked', role: 'student', status }]);
    expect(await service.provision({ sub: 'blocked-sub' }, 'consumer')).toBeNull();
  });
});
