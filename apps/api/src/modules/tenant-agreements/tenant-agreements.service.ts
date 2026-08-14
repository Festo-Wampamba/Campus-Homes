import { ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { and, asc, eq } from 'drizzle-orm';
import PDFDocument from 'pdfkit';

import {
  STATIC_TENANT_AGREEMENT_FIELD_TYPES,
  type SaveTenantAgreementTemplateInput,
  type SubmitTenantAgreementInput,
  type TenantAgreementFieldType,
} from '@campushomes/shared';

import { firstRow } from '../../db/client';
import { RlsDb } from '../../db/db.module';
import type { RlsContext } from '../../db/rls-context';
import {
  properties,
  propertyMemberships,
  students,
  tenantAgreementFields,
  tenantAgreementTemplates,
  tenantAgreements,
} from '../../db/schema';

// tenant_agreement_templates/_fields are svc_all-only RLS (see migration
// 0020's header comment): reads span landlord-own-property, custodian-
// assigned-property, ops, AND a student filling the form who has no
// ownership relationship to `properties` at all — no single RLS policy
// shape covers that, so authorization is this explicit in-code check
// instead, same posture as reservations.service.ts's unit-availability
// queries and publishListing().
const SERVICE_CTX: RlsContext = {
  userId: '00000000-0000-0000-0000-000000000000',
  role: 'service_role',
};

@Injectable()
export class TenantAgreementsService {
  constructor(private readonly rlsDb: RlsDb) {}

  // Landlord (own property) or an actively-assigned custodian — the two
  // roles allowed to design a property's tenant agreement (and, reused
  // below, to view its submissions), per the QR flow. Ops/admin always
  // allowed too (oversight parity with everything else ops touches here).
  private async assertCanManageProperty(ctx: RlsContext, propertyId: string): Promise<void> {
    if (ctx.role === 'ops_lead' || ctx.role === 'admin') return;
    const allowed = await this.rlsDb.run(SERVICE_CTX, async (db) => {
      if (ctx.role === 'landlord') {
        const [property] = await db.select().from(properties).where(eq(properties.id, propertyId));
        return property?.landlordId === ctx.userId;
      }
      if (ctx.role === 'custodian') {
        const [membership] = await db
          .select()
          .from(propertyMemberships)
          .where(
            and(
              eq(propertyMemberships.propertyId, propertyId),
              eq(propertyMemberships.userId, ctx.userId),
              eq(propertyMemberships.role, 'custodian'),
            ),
          );
        return membership != null && membership.revokedAt === null;
      }
      return false;
    });
    if (!allowed) {
      throw new ForbiddenException("You don't have permission to manage this property's tenant agreement");
    }
  }

  async getTemplateForEdit(ctx: RlsContext, propertyId: string) {
    await this.assertCanManageProperty(ctx, propertyId);
    return this.loadTemplate(propertyId);
  }

  // Public-ish: the QR landing page needs this before the visitor is
  // necessarily signed in (same reasoning as listings.service.ts
  // propertySummary) — returns null rather than 404 when the landlord
  // hasn't set one up yet, so the frontend shows a clear "not ready" state.
  getTemplateForFill(propertyId: string) {
    return this.loadTemplate(propertyId);
  }

  private async loadTemplate(propertyId: string) {
    return this.rlsDb.run(SERVICE_CTX, async (db) => {
      const [template] = await db
        .select()
        .from(tenantAgreementTemplates)
        .where(eq(tenantAgreementTemplates.propertyId, propertyId));
      if (!template) return null;
      const fields = await db
        .select()
        .from(tenantAgreementFields)
        .where(eq(tenantAgreementFields.templateId, template.id))
        .orderBy(asc(tenantAgreementFields.position));
      return { ...template, fields };
    });
  }

  async saveTemplate(ctx: RlsContext, propertyId: string, input: SaveTenantAgreementTemplateInput) {
    await this.assertCanManageProperty(ctx, propertyId);
    return this.rlsDb.run(SERVICE_CTX, async (db) => {
      const [existing] = await db
        .select()
        .from(tenantAgreementTemplates)
        .where(eq(tenantAgreementTemplates.propertyId, propertyId));

      const template = existing
        ? firstRow(
            await db
              .update(tenantAgreementTemplates)
              .set({ title: input.title, updatedAt: new Date() })
              .where(eq(tenantAgreementTemplates.id, existing.id))
              .returning(),
          )
        : firstRow(
            await db
              .insert(tenantAgreementTemplates)
              .values({ propertyId, title: input.title, createdBy: ctx.userId })
              .returning(),
          );

      // A whole-form save, not incremental field CRUD — replace the set
      // rather than diffing, same as how the ops publish form replaces
      // room-category rows.
      await db.delete(tenantAgreementFields).where(eq(tenantAgreementFields.templateId, template.id));
      const fields = await db
        .insert(tenantAgreementFields)
        .values(
          input.fields.map((f, index) => ({
            templateId: template.id,
            position: index,
            fieldType: f.fieldType,
            label: f.label,
            options: f.options ?? null,
            required: f.required,
          })),
        )
        .returning();
      return { ...template, fields };
    });
  }

  async submit(ctx: RlsContext, input: SubmitTenantAgreementInput) {
    const [property] = await this.rlsDb.run(SERVICE_CTX, (db) =>
      db.select().from(properties).where(eq(properties.id, input.propertyId)),
    );
    if (!property) {
      throw new NotFoundException('Property not found');
    }
    const template = await this.getTemplateForFill(input.propertyId);
    if (!template) {
      throw new NotFoundException('This property has no tenant agreement set up yet');
    }

    const fieldById = new Map(template.fields.map((f) => [f.id, f]));
    for (const field of template.fields) {
      if (!field.required || STATIC_TENANT_AGREEMENT_FIELD_TYPES.has(field.fieldType as TenantAgreementFieldType))
        continue;
      const answer = input.responses.find((r) => r.fieldId === field.id);
      const hasValue = Array.isArray(answer?.value) ? answer.value.length > 0 : Boolean(answer?.value);
      if (!hasValue) {
        throw new ConflictException(`"${field.label}" is required`);
      }
    }
    const responses = input.responses
      .filter((r) => fieldById.has(r.fieldId))
      .map((r) => {
        const field = fieldById.get(r.fieldId)!;
        return { fieldId: r.fieldId, label: field.label, fieldType: field.fieldType, value: r.value };
      });

    return this.rlsDb.run(ctx, async (db) => {
      // tenant_agreements.student_id FKs to students.user_id — same gap as
      // reservations.createHold: a signed-up student who never completed
      // their profile would otherwise hit a raw FK-violation 500 here.
      const [studentRow] = await db.select().from(students).where(eq(students.userId, ctx.userId));
      if (!studentRow) {
        throw new ForbiddenException('Complete your student profile before submitting a tenant agreement');
      }

      return firstRow(
        await db
          .insert(tenantAgreements)
          .values({
            templateId: template.id,
            propertyId: input.propertyId,
            studentId: ctx.userId,
            responses,
            signatureType: input.signature.type,
            signedName: input.signature.type === 'typed' ? input.signature.signedName : null,
            signatureStorageKey:
              input.signature.type === 'drawn' ? input.signature.signatureStorageKey : null,
          })
          .returning()
          .catch((err: { code?: string; cause?: { code?: string } }) => {
            // The unique index — this student already signed for this property.
            if (err.code === '23505' || err.cause?.code === '23505') {
              throw new ConflictException("You've already submitted a tenant agreement for this property");
            }
            throw err;
          }),
      );
    });
  }

  // The agreement page's "already submitted?" check — null means not yet.
  mine(ctx: RlsContext, propertyId: string) {
    return this.rlsDb.run(ctx, async (db) => {
      const row = await db.query.tenantAgreements.findFirst({
        where: and(eq(tenantAgreements.propertyId, propertyId), eq(tenantAgreements.studentId, ctx.userId)),
      });
      return row ?? null;
    });
  }

  // The blank-form PDF — "make sure they can download it" for whoever built
  // it (landlord/custodian/ops/admin), same authorization as editing. Not
  // exposed to students: they get the live interactive form, not a PDF of it.
  async generateTemplatePdf(ctx: RlsContext, propertyId: string): Promise<{ buffer: Buffer; fileName: string }> {
    await this.assertCanManageProperty(ctx, propertyId);
    const [property] = await this.rlsDb.run(SERVICE_CTX, (db) =>
      db.select().from(properties).where(eq(properties.id, propertyId)),
    );
    if (!property) {
      throw new NotFoundException('Property not found');
    }
    const template = await this.loadTemplate(propertyId);
    if (!template) {
      throw new NotFoundException('This property has no tenant agreement set up yet');
    }

    const pdf = new PDFDocument({ margin: 54, size: 'A4' });
    const chunks: Buffer[] = [];
    pdf.on('data', (chunk: Buffer) => chunks.push(chunk));
    const done = new Promise<Buffer>((resolve, reject) => {
      pdf.on('end', () => resolve(Buffer.concat(chunks)));
      pdf.on('error', reject);
    });

    pdf.font('Helvetica-Bold').fontSize(20).fillColor('#0f766e').text(template.title);
    pdf.moveDown(0.2).font('Helvetica').fontSize(9).fillColor('#475569').text(property.name);
    pdf.moveDown(1.2);

    for (const field of template.fields) {
      if (pdf.y > pdf.page.height - 100) pdf.addPage();
      if (field.fieldType === 'heading') {
        pdf.moveDown(0.5).font('Helvetica-Bold').fontSize(14).fillColor('#0f172a').text(field.label);
        continue;
      }
      if (field.fieldType === 'paragraph') {
        pdf.moveDown(0.3).font('Helvetica').fontSize(10).fillColor('#334155').text(field.label);
        continue;
      }
      pdf.moveDown(0.6).font('Helvetica-Bold').fontSize(11).fillColor('#0f172a');
      pdf.text(field.label + (field.required ? ' *' : ''));
      pdf.font('Helvetica').fontSize(10).fillColor('#334155');
      if (field.fieldType === 'fill_in') {
        pdf.moveDown(0.2).text('_'.repeat(60));
      } else {
        const marker = field.fieldType === 'checkboxes' ? '[ ]' : '( )';
        for (const option of (field.options ?? [])) {
          pdf.moveDown(0.15).text(`${marker}  ${option}`);
        }
      }
    }

    pdf.moveDown(1.5).font('Helvetica').fontSize(9).fillColor('#64748b');
    pdf.text('Tenant signature: ____________________________     Date: ______________');

    pdf.end();
    const buffer = await done;
    return { buffer, fileName: `${template.title.replace(/[^a-z0-9]+/gi, '-').toLowerCase()}.pdf` };
  }

  // Landlord's / custodian's own-property read / ops oversight. Runs under
  // SERVICE_CTX after the same explicit check saveTemplate() uses — unlike
  // that RLS-backed self-only case, this join reaches into `users` for the
  // signer's account name, and users_read only allows a landlord to read
  // their own row or a lead's, not an arbitrary student's.
  async forProperty(ctx: RlsContext, propertyId: string) {
    await this.assertCanManageProperty(ctx, propertyId);
    return this.rlsDb.run(SERVICE_CTX, async (_db, client) => {
      const res = await client.query(
        `SELECT ta.*, u.name AS student_name
         FROM tenant_agreements ta
         JOIN users u ON u.id = ta.student_id
         WHERE ta.property_id = $1
         ORDER BY ta.submitted_at DESC`,
        [propertyId],
      );
      return res.rows as unknown[];
    });
  }
}
