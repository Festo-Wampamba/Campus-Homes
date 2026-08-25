import { Injectable } from '@nestjs/common';
import { and, desc, eq } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';

import type { CreateInquiryInput, ResolveInquiryInput } from '@campushomes/shared';

import { RlsDb } from '../../db/db.module';
import type { Db } from '../../db/client';
import type { RlsContext } from '../../db/rls-context';
import { inquiries, users } from '../../db/schema';
import { loadEnv } from '../../config/env';
import { AuditService } from '../ops/audit.service';
import { sendInquiryEmail } from './inquiry-email';

const SERVICE_CTX: RlsContext = {
  userId: '00000000-0000-0000-0000-000000000000',
  role: 'service_role',
};

const student = alias(users, 'student');
const resolver = alias(users, 'resolver');

// inquiries is owner-scoped under RLS (0028): students insert/read their own
// rows directly through the user ctx; every staff path here runs as
// service_role with PermissionsGuard (inquiries.read/inquiries.resolve) as
// the real authorization boundary — same posture as activities.
@Injectable()
export class InquiriesService {
  private readonly env = loadEnv();

  constructor(
    private readonly rlsDb: RlsDb,
    private readonly audit: AuditService,
  ) {}

  private selection() {
    return {
      id: inquiries.id,
      category: inquiries.category,
      subject: inquiries.subject,
      message: inquiries.message,
      status: inquiries.status,
      resolution: inquiries.resolution,
      studentId: inquiries.studentId,
      studentName: student.name,
      studentEmail: student.email,
      studentPhone: student.phone,
      resolvedByName: resolver.name,
      createdAt: inquiries.createdAt,
      updatedAt: inquiries.updatedAt,
    };
  }

  // Student submits an inquiry. Runs under the caller's own RLS ctx — the
  // inquiries_self policy scopes the insert, so a forged studentId can't
  // land on someone else's row.
  //
  // The post-insert read happens on the SAME db handle inside this
  // transaction: routing it through byId()'s own rlsDb.run would grab a
  // second pooled connection whose transaction cannot see this uncommitted
  // insert, and the read would come back empty.
  async create(ctx: RlsContext, input: CreateInquiryInput) {
    const created = await this.rlsDb.run(ctx, async (db) => {
      const [row] = await db
        .insert(inquiries)
        .values({
          studentId: ctx.userId,
          category: input.category,
          subject: input.subject,
          message: input.message,
        })
        .returning({ id: inquiries.id });
      if (!row) throw new Error('Inquiry insert returned no row');
      return this.selectById(db, row.id);
    });
    if (!created) throw new Error('Inquiry insert returned no row');

    // Email leg is best-effort: the inquiry is already durably stored and
    // visible in both staff consoles, so a mailer failure must not fail the
    // submission (or surface a 500 to the student).
    sendInquiryEmail(this.env, created).catch((err: unknown) => {
      console.error('[inquiries] notification email failed:', err);
    });
    return created;
  }

  mine(ctx: RlsContext) {
    return this.rlsDb.run(ctx, (db) =>
      db
        .select(this.selection())
        .from(inquiries)
        .leftJoin(student, eq(student.id, inquiries.studentId))
        .leftJoin(resolver, eq(resolver.id, inquiries.resolvedBy))
        .where(eq(inquiries.studentId, ctx.userId))
        .orderBy(desc(inquiries.createdAt)),
    );
  }

  list(status?: string) {
    return this.rlsDb.run(SERVICE_CTX, (db) =>
      db
        .select(this.selection())
        .from(inquiries)
        .leftJoin(student, eq(student.id, inquiries.studentId))
        .leftJoin(resolver, eq(resolver.id, inquiries.resolvedBy))
        .where(status ? and(eq(inquiries.status, status)) : undefined)
        .orderBy(desc(inquiries.createdAt)),
    );
  }

  // Same-tx read after the update — see the note on create() for why this
  // must not hop to a fresh rlsDb.run/connection.
  async resolve(id: string, ctx: RlsContext, input: ResolveInquiryInput) {
    const updated = await this.rlsDb.run(SERVICE_CTX, async (db) => {
      const [row] = await db
        .update(inquiries)
        .set({
          status: input.status,
          ...(input.resolution !== undefined ? { resolution: input.resolution } : {}),
          resolvedBy: input.status === 'resolved' ? ctx.userId : null,
          resolvedAt: input.status === 'resolved' ? new Date() : null,
          updatedAt: new Date(),
        })
        .where(eq(inquiries.id, id))
        .returning({ id: inquiries.id });
      if (!row) return undefined;
      return this.selectById(db, row.id);
    });
    // Decision record for the ops audit trail (§17): who resolved what, with
    // the response text. Written after the tx closes so the audit insert gets
    // its own connection instead of nesting inside the update's.
    if (updated) {
      await this.audit.record(ctx, 'inquiry.resolve', 'inquiry', id, {
        status: input.status,
        resolution: input.resolution ?? null,
        subject: updated.subject,
        studentId: updated.studentId,
      });
    }
    return updated;
  }

  private selectById(db: Db, id: string) {
    return db
      .select(this.selection())
      .from(inquiries)
      .leftJoin(student, eq(student.id, inquiries.studentId))
      .leftJoin(resolver, eq(resolver.id, inquiries.resolvedBy))
      .where(eq(inquiries.id, id))
      .then((rows) => rows[0]);
  }
}
