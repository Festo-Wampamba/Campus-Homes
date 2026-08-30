import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { and, desc, eq } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';

import type {
  CreateInquiryInput,
  ForwardInquiryInput,
  InquiryForwardTarget,
  ResolveInquiryInput,
  RespondToInquiryInput,
} from '@campushomes/shared';

import { RlsDb } from '../../db/db.module';
import type { Db } from '../../db/client';
import type { RlsContext } from '../../db/rls-context';
import { inquiries, listings, properties, users } from '../../db/schema';
import { loadEnv } from '../../config/env';
import { AuditService } from '../ops/audit.service';
import { NotificationsService } from '../notifications/notifications.service';
import { StaffService } from '../staff/staff.service';
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
    private readonly notifications: NotificationsService,
    private readonly staff: StaffService,
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
      listingId: inquiries.listingId,
      landlordId: inquiries.landlordId,
      landlordResponse: inquiries.landlordResponse,
      landlordRespondedAt: inquiries.landlordRespondedAt,
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
    // Resolved under SERVICE_CTX because a student's own RLS ctx can't read
    // properties (owner+ops only) — the client only ever supplies listingId,
    // never landlordId, so there's nothing here for a forged request to
    // misroute. Only a verified listing's landlord is a valid recipient.
    let landlordId: string | null = null;
    if (input.listingId) {
      const [row] = await this.rlsDb.run(SERVICE_CTX, (db) =>
        db
          .select({ landlordId: properties.landlordId })
          .from(listings)
          .innerJoin(properties, eq(properties.id, listings.propertyId))
          .where(and(eq(listings.id, input.listingId!), eq(listings.status, 'verified'))),
      );
      landlordId = row?.landlordId ?? null;
    }

    const created = await this.rlsDb.run(ctx, async (db) => {
      const [row] = await db
        .insert(inquiries)
        .values({
          studentId: ctx.userId,
          category: input.category,
          subject: input.subject,
          message: input.message,
          listingId: input.listingId ?? null,
          landlordId,
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
    // Landlord notification is also best-effort — the enquiry is already
    // durably stored and visible to the landlord next time they check, so a
    // notify failure must not fail the student's submission.
    if (landlordId) {
      this.notifications
        .notify(landlordId, 'inquiry.received', 'sms', {
          inquiryId: created.id,
          message: `New enquiry about your listing: "${created.subject}" — ${created.message}`,
        })
        .catch((err: unknown) => {
          console.error('[inquiries] landlord notify failed:', err);
        });
    }
    return created;
  }

  // Landlord's own inbox — runs under the landlord's own ctx (not
  // SERVICE_CTX) so RLS itself scopes the rows via inquiries_landlord_select
  // (0030), the same pattern as landlords_self_* elsewhere.
  landlordMine(ctx: RlsContext) {
    return this.rlsDb.run(ctx, (db) =>
      db
        .select(this.selection())
        .from(inquiries)
        .leftJoin(student, eq(student.id, inquiries.studentId))
        .leftJoin(resolver, eq(resolver.id, inquiries.resolvedBy))
        .where(eq(inquiries.landlordId, ctx.userId))
        .orderBy(desc(inquiries.createdAt)),
    );
  }

  // Landlord's reply to their own listing-scoped enquiry. Runs under the
  // landlord's own ctx: inquiries_landlord_respond (0030) scopes the row,
  // and the column-level GRANT (0030) means this UPDATE physically cannot
  // touch status/resolution even if a bug tried — those stay staff-authored.
  async respond(ctx: RlsContext, id: string, input: RespondToInquiryInput) {
    const updated = await this.rlsDb.run(ctx, async (db) => {
      const [row] = await db
        .update(inquiries)
        .set({
          landlordResponse: input.response,
          landlordRespondedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(and(eq(inquiries.id, id), eq(inquiries.landlordId, ctx.userId)))
        .returning({ id: inquiries.id });
      if (!row) return undefined;
      return this.selectById(db, row.id);
    });
    if (!updated) throw new ForbiddenException('Inquiry not found or not addressed to you');
    return updated;
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

  // Staff + landlord roster for the "Forward to" picker (0030). Landlords
  // have no console access to inquiries at all, so they only ever reach
  // this via the notification forward() sends — never a real read grant.
  async forwardTargets(): Promise<InquiryForwardTarget[]> {
    const staffRows = await this.staff.list();
    const landlordRows = await this.rlsDb.run(SERVICE_CTX, async (_db, client) => {
      const res = await client.query<{ user_id: string; legal_name: string }>(
        `SELECT l.user_id, l.legal_name
         FROM landlords l
         JOIN users u ON u.id = l.user_id
         WHERE u.status = 'active'
         ORDER BY l.legal_name ASC`,
      );
      return res.rows;
    });
    return [
      ...staffRows.map((s) => ({
        id: s.id,
        name: s.name,
        role: s.role,
        label: `${s.name ?? 'Unnamed'} — ${s.role}`,
      })),
      ...landlordRows.map((l) => ({
        id: l.user_id,
        name: l.legal_name,
        role: 'landlord',
        label: `${l.legal_name} — Landlord`,
      })),
    ];
  }

  // Notify-only forward (0030): the inquiry itself is unchanged, still sits
  // in the shared staff inbox either way — this just pings whoever the
  // caller thinks should look at it. A landlord has no console to read it
  // in, so their forward is SMS; staff already live in the console daily,
  // so theirs is in_app.
  async forward(ctx: RlsContext, id: string, input: ForwardInquiryInput) {
    const inquiry = await this.rlsDb.run(SERVICE_CTX, (db) => this.selectById(db, id));
    if (!inquiry) throw new NotFoundException('Inquiry not found');
    const [recipient] = await this.rlsDb.run(SERVICE_CTX, (db) =>
      db
        .select({ id: users.id, role: users.role, phone: users.phone })
        .from(users)
        .where(eq(users.id, input.recipientUserId)),
    );
    if (!recipient) throw new NotFoundException('Recipient not found');

    const payload = {
      inquiryId: id,
      subject: inquiry.subject,
      message: `Inquiry forwarded: "${inquiry.subject}" — ${inquiry.message}${
        input.note ? ` (Note: ${input.note})` : ''
      }`,
      note: input.note ?? null,
    };
    if (recipient.role === 'landlord') {
      await this.notifications.notify(recipient.id, 'inquiry.forwarded', 'sms', payload);
    } else {
      await this.notifications.notify(recipient.id, 'inquiry.forwarded', 'in_app', payload);
    }

    await this.audit.record(ctx, 'inquiry.forward', 'inquiry', id, {
      recipientUserId: input.recipientUserId,
      note: input.note ?? null,
    });
    return { forwarded: true };
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
