import 'reflect-metadata';

import { NotFoundException } from '@nestjs/common';
import type { PoolClient } from 'pg';

import type { Inquiry } from '@campushomes/shared';

import type { Db } from '../../db/client';
import { RlsDb } from '../../db/db.module';
import type { RlsContext } from '../../db/rls-context';
import { PERMISSION_KEY } from '../auth/permissions';
import { AuditService } from '../ops/audit.service';
import { NotificationsService } from '../notifications/notifications.service';
import { StaffService } from '../staff/staff.service';
import { AdminInquiriesController } from './admin-inquiries.controller';
import { InquiriesService } from './inquiries.service';

process.env.DATABASE_URL = process.env.DATABASE_URL || 'postgresql://localhost/campushomes_test';

const INQUIRY_ID = '11111111-1111-4111-8111-111111111111';
const STAFF_ID = '22222222-2222-4222-8222-222222222222';
const LANDLORD_ID = '33333333-3333-4333-8333-333333333333';
const UNKNOWN_ID = '44444444-4444-4444-8444-444444444444';
const STUDENT_ID = '55555555-5555-4555-8555-555555555555';
const INACTIVE_STAFF_ID = '66666666-6666-4666-8666-666666666666';
const INACTIVE_LANDLORD_ID = '77777777-7777-4777-8777-777777777777';

const inquiry = {
  id: INQUIRY_ID,
  category: 'general',
  subject: 'Private support request',
  message: 'Please help with this private request.',
  status: 'open',
  resolution: null,
  studentId: STUDENT_ID,
  studentName: 'Student Name',
  studentEmail: 'student@example.test',
  studentPhone: '+256700000001',
  resolvedByName: null,
  listingId: null,
  landlordId: null,
  landlordResponse: null,
  landlordRespondedAt: null,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
} as unknown as Inquiry;

type StaffRow = {
  id: string;
  name: string;
  role: string;
  status: string;
};

type LandlordRow = {
  user_id: string;
  legal_name: string;
};

function fixture(options: {
  staffRows?: StaffRow[];
  landlordRows?: LandlordRow[];
} = {}) {
  const staff = {
    list: jest.fn().mockResolvedValue(options.staffRows ?? []),
  } as unknown as StaffService;
  const landlordRows = options.landlordRows ?? [];
  const client = {
    query: jest.fn(async () => ({ rows: landlordRows })),
  } as unknown as PoolClient;
  const db = {} as Db;
  const rlsDb = {
    run: jest.fn(async <T>(
      _ctx: RlsContext,
      callback: (callbackDb: Db, callbackClient: PoolClient) => Promise<T>,
    ) => callback(db, client)),
  } as unknown as RlsDb;
  const notifications = {
    notify: jest.fn().mockResolvedValue(undefined),
  } as unknown as NotificationsService;
  const audit = {
    record: jest.fn().mockResolvedValue(undefined),
  } as unknown as AuditService;
  const service = new InquiriesService(rlsDb, audit, notifications, staff);
  jest
    .spyOn(
      service as unknown as { selectById: (callbackDb: Db, id: string) => Promise<Inquiry | undefined> },
      'selectById',
    )
    .mockResolvedValue(inquiry);

  return {
    service,
    client,
    notify: notifications.notify as jest.Mock,
    record: audit.record as jest.Mock,
  };
}

const actor: RlsContext = {
  userId: '88888888-8888-4888-8888-888888888888',
  role: 'admin',
};

describe('inquiry forwarding authorization', () => {
  it('requires resolve permission for forwarding and its recipient roster, while reads remain read-only', () => {
    const prototype = AdminInquiriesController.prototype;

    expect(Reflect.getMetadata(PERMISSION_KEY, prototype.forward)).toBe('inquiries.resolve');
    expect(Reflect.getMetadata(PERMISSION_KEY, prototype.forwardTargets)).toBe('inquiries.resolve');
    expect(Reflect.getMetadata(PERMISSION_KEY, prototype.list)).toEqual([
      'inquiries.resolve',
      'inquiries.read',
    ]);
  });

  it('keeps only active staff and active landlords in the forwarding roster', async () => {
    const { service, client } = fixture({
      staffRows: [
        { id: STAFF_ID, name: 'Ops Lead', role: 'admin', status: 'active' },
        { id: INACTIVE_STAFF_ID, name: 'Suspended Ops', role: 'admin', status: 'suspended' },
        { id: STUDENT_ID, name: 'Student', role: 'student', status: 'active' },
      ],
      landlordRows: [{ user_id: LANDLORD_ID, legal_name: 'Active Landlord' }],
    });

    await expect(service.forwardTargets()).resolves.toEqual([
      { id: STAFF_ID, name: 'Ops Lead', role: 'admin', label: 'Ops Lead: admin' },
      { id: LANDLORD_ID, name: 'Active Landlord', role: 'landlord', label: 'Active Landlord: Landlord' },
    ]);
    const query = String((client.query as jest.Mock).mock.calls[0]?.[0]);
    expect(query).toContain("u.status = 'active'");
    expect(query).toContain('u.deleted_at IS NULL');
  });

  it('forwards to an active staff member without changing the inquiry', async () => {
    const { service, notify, record } = fixture({
      staffRows: [{ id: STAFF_ID, name: 'Ops Lead', role: 'admin', status: 'active' }],
    });
    const before = structuredClone(inquiry);

    await expect(service.forward(actor, INQUIRY_ID, { recipientUserId: STAFF_ID, note: 'Please review.' }))
      .resolves.toEqual({ forwarded: true });

    expect(notify).toHaveBeenCalledWith(
      STAFF_ID,
      'inquiry.forwarded',
      'in_app',
      expect.objectContaining({ inquiryId: INQUIRY_ID, note: 'Please review.' }),
    );
    expect(record).toHaveBeenCalledWith(
      actor,
      'inquiry.forward',
      'inquiry',
      INQUIRY_ID,
      expect.objectContaining({ recipientUserId: STAFF_ID }),
    );
    expect(inquiry).toEqual(before);
  });

  it('forwards to an active landlord through SMS without changing the inquiry', async () => {
    const { service, notify } = fixture({
      landlordRows: [{ user_id: LANDLORD_ID, legal_name: 'Active Landlord' }],
    });
    const before = structuredClone(inquiry);

    await expect(service.forward(actor, INQUIRY_ID, { recipientUserId: LANDLORD_ID }))
      .resolves.toEqual({ forwarded: true });

    expect(notify).toHaveBeenCalledWith(
      LANDLORD_ID,
      'inquiry.forwarded',
      'sms',
      expect.objectContaining({ inquiryId: INQUIRY_ID }),
    );
    expect(inquiry).toEqual(before);
  });

  it.each([
    ['an unknown user', UNKNOWN_ID, [], []],
    ['a student, even if a malformed staff row exists', STUDENT_ID, [
      { id: STUDENT_ID, name: 'Student', role: 'student', status: 'active' },
    ], []],
    ['an inactive staff member', INACTIVE_STAFF_ID, [
      { id: INACTIVE_STAFF_ID, name: 'Suspended Ops', role: 'admin', status: 'suspended' },
    ], []],
    ['an inactive landlord', INACTIVE_LANDLORD_ID, [], []],
  ])('rejects forwarding to %s', async (_label, recipientUserId, staffRows, landlordRows) => {
    const { service, notify, record } = fixture({
      staffRows: staffRows as StaffRow[],
      landlordRows: landlordRows as LandlordRow[],
    });

    await expect(service.forward(actor, INQUIRY_ID, { recipientUserId })).rejects.toBeInstanceOf(NotFoundException);
    expect(notify).not.toHaveBeenCalled();
    expect(record).not.toHaveBeenCalled();
  });
});
