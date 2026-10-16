/**
 * Saving platform settings must work even when a setting row is missing —
 * production lost support_contact, and the old UPDATE-only save failed the
 * whole form with "Setting support_contact is not initialized".
 */
import { Pool } from 'pg';

import { RlsDb } from '../../src/db/db.module';
import { AuditService } from '../../src/modules/ops/audit.service';
import { AdminConfigService } from '../../src/modules/staff/admin-config.service';
import { testDatabaseUrl } from '../test-database-url';

const pool = new Pool({ connectionString: testDatabaseUrl(), max: 3 });
const rlsDb = new RlsDb(pool);
const service = new AdminConfigService(rlsDb, new AuditService(rlsDb));

let adminId: string;

beforeAll(async () => {
  await pool.query(`TRUNCATE users CASCADE`);
  await pool.query(`DELETE FROM platform_settings WHERE key = 'support_contact'`);
  adminId = (await pool.query(
    `INSERT INTO users (phone, role, status, name) VALUES ('+256700009901', 'admin', 'active', 'Settings Admin') RETURNING id`,
  )).rows[0].id;
});

afterAll(async () => {
  // Same cleanup as the other DB specs; the cascade also clears updated_by rows.
  await pool.query(`TRUNCATE users CASCADE`);
  await pool.end();
});

it('creates a missing setting row when an admin saves it', async () => {
  const contact = { email: 'hello@campushomes.co.ug', phone: '+256768561023' };

  await service.updateSettings({ userId: adminId, role: 'admin' }, { supportContact: contact });

  const row = (await pool.query(`SELECT value FROM platform_settings WHERE key = 'support_contact'`)).rows[0];
  expect(row?.value).toEqual(contact);
});
