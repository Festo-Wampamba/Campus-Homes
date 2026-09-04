import { BadGatewayException, ConflictException, Injectable } from '@nestjs/common';
import {
  AlignmentType,
  Document,
  HeadingLevel,
  Packer,
  Paragraph,
  Table,
  TableCell,
  TableRow,
  TextRun,
  WidthType,
} from 'docx';
import ExcelJS from 'exceljs';
import PDFDocument from 'pdfkit';
import PptxGenJS from 'pptxgenjs';

import type { ReportExportRequestInput } from '@campushomes/shared';

import { loadEnv } from '../../config/env';
import { RlsDb } from '../../db/db.module';
import type { RlsContext } from '../../db/rls-context';
import { AuditService } from '../ops/audit.service';

const SERVICE_CTX: RlsContext = {
  userId: '00000000-0000-0000-0000-000000000000',
  role: 'service_role',
};

type DataRow = Record<string, unknown>;

export type ExportResult =
  | { kind: 'file'; buffer: Buffer; mimeType: string; fileName: string }
  | { kind: 'published'; exportId: string; destination: 'power_bi'; rowCount: number; published: true };

function value(value: unknown): string | number | boolean {
  if (value === null || value === undefined) return '';
  if (value instanceof Date) return value.toISOString();
  if (typeof value === 'object') return JSON.stringify(value);
  if (typeof value === 'bigint') return Number(value);
  return value as string | number | boolean;
}

function title(input: ReportExportRequestInput): string {
  return `CampusHomes ${input.reportType.replaceAll('_', ' ')} report`;
}

function stamp(): string {
  return new Date().toISOString().replaceAll(':', '-').replace(/\.\d{3}Z$/, 'Z');
}

@Injectable()
export class AdminExportsService {
  constructor(
    private readonly rlsDb: RlsDb,
    private readonly audit: AuditService,
  ) {}

  history() {
    return this.rlsDb.run(SERVICE_CTX, async (_db, client) => {
      const rows = await client.query(`
        SELECT re.id, re.report_type AS "reportType", re.format, re.destination,
               re.filters, re.status, re.file_name AS "fileName",
               re.created_at AS "createdAt", re.completed_at AS "completedAt",
               coalesce(nullif(u.name, ''), u.email) AS "createdBy"
        FROM report_exports re JOIN users u ON u.id = re.created_by
        ORDER BY re.created_at DESC LIMIT 100
      `);
      return { rows: rows.rows, asOf: new Date().toISOString() };
    });
  }

  async generate(actor: RlsContext, input: ReportExportRequestInput): Promise<ExportResult> {
    const rows = await this.loadRows(input);
    const effectiveFormat = input.destination === 'financial_model' ? 'xlsx' : input.format;
    const fileName = `campushomes-${input.reportType}-${stamp()}.${effectiveFormat}`;
    const exportId = await this.createExportRecord(actor, input, fileName);

    try {
      if (input.destination === 'power_bi') {
        await this.publishPowerBi(input, rows);
        await this.completeExport(exportId);
        await this.audit.record(actor, 'reports.publish_powerbi', 'report_export', exportId, {
          reportType: input.reportType,
          rowCount: rows.length,
        });
        return { kind: 'published', exportId, destination: 'power_bi', rowCount: rows.length, published: true };
      }

      const generated = await this.toFile(effectiveFormat, title(input), rows, input);
      await this.completeExport(exportId);
      await this.audit.record(actor, 'reports.export', 'report_export', exportId, {
        reportType: input.reportType,
        format: effectiveFormat,
        destination: input.destination,
        rowCount: rows.length,
      });
      return { kind: 'file', ...generated, fileName };
    } catch (error) {
      await this.failExport(exportId, error instanceof Error ? error.message : 'Export failed');
      throw error;
    }
  }

  private loadRows(input: ReportExportRequestInput): Promise<DataRow[]> {
    return this.rlsDb.run(SERVICE_CTX, async (_db, client) => {
      const from = input.dateFrom ?? '1970-01-01';
      const to = input.dateTo ?? '2999-12-31';
      const catchment = input.catchment;
      const statuses = input.statuses;

      if (input.reportType === 'users') {
        const result = await client.query(`
          SELECT u.id, u.name,
                 CASE WHEN $5::boolean THEN u.email ELSE NULL END AS email,
                 CASE WHEN $5::boolean THEN u.phone ELSE NULL END AS phone,
                 u.role::text AS "accountType", u.status::text, s.university::text,
                 s.year_of_study AS "yearOfStudy", l.kyc_status::text AS "landlordKycStatus",
                 u.created_at AS "createdAt"
          FROM users u LEFT JOIN students s ON s.user_id = u.id LEFT JOIN landlords l ON l.user_id = u.id
          WHERE u.deleted_at IS NULL AND u.created_at::date BETWEEN $1::date AND $2::date
            AND ($3 = 'all' OR s.university::text = $3)
            AND (cardinality($4::text[]) = 0 OR u.status::text = ANY($4::text[]))
          ORDER BY u.created_at DESC LIMIT 5000
        `, [from, to, catchment, statuses, input.includePersonallyIdentifiableInformation]);
        return result.rows;
      }

      if (input.reportType === 'properties') {
        return (await client.query(`
          SELECT p.id, p.name, p.type::text, p.catchment::text, p.street_address AS address,
                 p.status::text AS "verificationStatus", p.operational_status AS "operationalStatus",
                 coalesce(nullif(u.name, ''), l.legal_name) AS landlord,
                 count(DISTINCT un.id)::int AS units,
                 count(DISTINCT un.id) FILTER (WHERE un.operational_status IN ('available','vacant'))::int AS "availableUnits",
                 p.created_at AS "createdAt"
          FROM properties p JOIN landlords l ON l.user_id = p.landlord_id JOIN users u ON u.id = p.landlord_id
          LEFT JOIN listings li ON li.property_id = p.id LEFT JOIN units un ON un.listing_id = li.id
          WHERE p.created_at::date BETWEEN $1::date AND $2::date
            AND ($3 = 'all' OR p.catchment::text = $3)
            AND (cardinality($4::text[]) = 0 OR p.status::text = ANY($4::text[]) OR p.operational_status = ANY($4::text[]))
          GROUP BY p.id, u.name, l.legal_name ORDER BY p.created_at DESC LIMIT 5000
        `, [from, to, catchment, statuses])).rows;
      }

      if (input.reportType === 'reservations') {
        return (await client.query(`
          SELECT r.id, r.status::text, r.booking_fee_collected_ugx AS "bookingFeeCollectedUgx", p.name AS property,
                 p.catchment::text, un.label AS unit, bd.label AS bed,
                 CASE WHEN $5::boolean THEN coalesce(nullif(u.name,''),u.email,u.phone) ELSE 'Redacted' END AS student,
                 r.payment_method::text AS "paymentMethod", r.created_at AS "createdAt"
          FROM reservations r JOIN users u ON u.id = r.student_id JOIN beds bd ON bd.id = r.bed_id
          JOIN units un ON un.id = bd.unit_id
          JOIN listings li ON li.id = un.listing_id JOIN properties p ON p.id = li.property_id
          WHERE r.created_at::date BETWEEN $1::date AND $2::date
            AND ($3 = 'all' OR p.catchment::text = $3)
            AND (cardinality($4::text[]) = 0 OR r.status::text = ANY($4::text[]))
          ORDER BY r.created_at DESC LIMIT 5000
        `, [from, to, catchment, statuses, input.includePersonallyIdentifiableInformation])).rows;
      }

      if (input.reportType === 'finance') {
        return (await client.query(`
          SELECT pay.id, pay.provider::text, pay.status::text, pay.amount_ugx AS "amountUgx",
                 pay.currency, pay.payment_method::text AS "paymentMethod",
                 p.name AS property, p.catchment::text, r.id AS "reservationId",
                 pay.webhook_verified AS "webhookVerified", pay.created_at AS "createdAt"
          FROM payments pay JOIN reservations r ON r.id = pay.reservation_id
          JOIN beds bd ON bd.id = r.bed_id JOIN units un ON un.id = bd.unit_id JOIN listings li ON li.id = un.listing_id
          JOIN properties p ON p.id = li.property_id
          WHERE pay.created_at::date BETWEEN $1::date AND $2::date
            AND ($3 = 'all' OR p.catchment::text = $3)
            AND (cardinality($4::text[]) = 0 OR pay.status::text = ANY($4::text[]))
          ORDER BY pay.created_at DESC LIMIT 5000
        `, [from, to, catchment, statuses])).rows;
      }

      if (input.reportType === 'verifications') {
        const visits = await client.query(`
            SELECT 'property_visit' AS "recordType", v.id, p.name AS subject,
                   p.catchment::text, v.result::text AS status,
                   coalesce(nullif(u.name,''),u.email) AS reviewer,
                   v.scheduled_at AS "scheduledAt", v.completed_at AS "completedAt",
                   v.failure_reason AS finding, v.created_at AS "createdAt"
            FROM verification_visits v JOIN properties p ON p.id = v.property_id JOIN users u ON u.id = v.inspector_id
            WHERE v.created_at::date BETWEEN $1::date AND $2::date
              AND ($3 = 'all' OR p.catchment::text = $3)
              AND (cardinality($4::text[]) = 0 OR v.result::text = ANY($4::text[]))
            ORDER BY v.created_at DESC LIMIT 2500
          `, [from, to, catchment, statuses]);
        const kyc = await client.query(`
            SELECT 'landlord_kyc' AS "recordType", l.user_id AS id,
                   coalesce(nullif(u.name,''),l.legal_name) AS subject,
                   NULL::text AS catchment, l.kyc_status::text AS status,
                   coalesce(nullif(reviewer.name,''), reviewer.email) AS reviewer,
                   NULL::timestamptz AS "scheduledAt", l.kyc_reviewed_at AS "completedAt",
                   NULL::text AS finding, l.created_at AS "createdAt"
            FROM landlords l JOIN users u ON u.id = l.user_id LEFT JOIN users reviewer ON reviewer.id = l.kyc_reviewed_by
            WHERE l.created_at::date BETWEEN $1::date AND $2::date
              AND (cardinality($3::text[]) = 0 OR l.kyc_status::text = ANY($3::text[]))
            ORDER BY l.created_at DESC LIMIT 2500
          `, [from, to, statuses]);
        return [...visits.rows, ...kyc.rows];
      }

      if (input.reportType === 'catchments') {
        return (await client.query(`
          SELECT p.catchment::text AS catchment, count(DISTINCT p.id)::int AS properties,
                 count(DISTINCT li.id) FILTER (WHERE li.status = 'verified')::int AS "verifiedListings",
                 count(DISTINCT un.id)::int AS units,
                 count(DISTINCT r.id)::int AS reservations,
                 coalesce(sum(pay.amount_ugx) FILTER (WHERE pay.status = 'succeeded'),0)::bigint AS "revenueUgx"
          FROM properties p LEFT JOIN listings li ON li.property_id = p.id LEFT JOIN units un ON un.listing_id = li.id
          LEFT JOIN beds bd ON bd.unit_id = un.id
          LEFT JOIN reservations r ON r.bed_id = bd.id AND r.created_at::date BETWEEN $1::date AND $2::date
          LEFT JOIN payments pay ON pay.reservation_id = r.id
          WHERE ($3 = 'all' OR p.catchment::text = $3) GROUP BY p.catchment ORDER BY p.catchment
        `, [from, to, catchment])).rows;
      }

      return (await client.query(`
        SELECT 'users' AS metric, count(*)::bigint AS value FROM users WHERE deleted_at IS NULL
        UNION ALL SELECT 'properties', count(*)::bigint FROM properties
        UNION ALL SELECT 'verified_listings', count(*)::bigint FROM listings WHERE status = 'verified'
        UNION ALL SELECT 'reservations', count(*)::bigint FROM reservations WHERE created_at::date BETWEEN $1::date AND $2::date
        UNION ALL SELECT 'revenue_ugx', coalesce(sum(amount_ugx),0)::bigint FROM payments WHERE status = 'succeeded' AND created_at::date BETWEEN $1::date AND $2::date
      `, [from, to])).rows;
    });
  }

  private async toFile(
    format: string,
    reportTitle: string,
    rows: DataRow[],
    input: ReportExportRequestInput,
  ): Promise<{ buffer: Buffer; mimeType: string }> {
    const columns = rows.length ? Object.keys(rows[0]!) : ['message'];
    const normalized = rows.length ? rows : [{ message: 'No records matched the selected filters.' }];

    if (format === 'json') {
      return { buffer: Buffer.from(JSON.stringify({ title: reportTitle, generatedAt: new Date().toISOString(), filters: input, rows: normalized }, null, 2)), mimeType: 'application/json' };
    }
    if (format === 'csv') {
      const cell = (entry: unknown) => `"${String(value(entry)).replaceAll('"', '""')}"`;
      const csv = [columns.map(cell).join(','), ...normalized.map((row) => columns.map((column) => cell(row[column])).join(','))].join('\n');
      return { buffer: Buffer.from(`\uFEFF${csv}`), mimeType: 'text/csv; charset=utf-8' };
    }
    if (format === 'xlsx') {
      const workbook = new ExcelJS.Workbook();
      workbook.creator = 'CampusHomes';
      const sheet = workbook.addWorksheet('Report', { views: [{ state: 'frozen', ySplit: 1 }] });
      sheet.columns = columns.map((column) => ({ header: column.replaceAll('_', ' '), key: column, width: Math.min(40, Math.max(14, column.length + 4)) }));
      normalized.forEach((row) => sheet.addRow(Object.fromEntries(columns.map((column) => [column, value(row[column])]))));
      sheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
      sheet.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0F766E' } };
      sheet.autoFilter = { from: 'A1', to: `${sheet.getColumn(columns.length).letter}1` };
      const notes = workbook.addWorksheet('Export details');
      notes.addRows([
        ['Report', reportTitle], ['Generated', new Date().toISOString()], ['Rows', rows.length],
        ['Destination', input.destination], ['Date from', input.dateFrom ?? 'All'], ['Date to', input.dateTo ?? 'All'],
        ['Catchment', input.catchment], ['Statuses', input.statuses.join(', ') || 'All'],
      ]);
      if (input.destination === 'financial_model') {
        const model = workbook.addWorksheet('Financial model');
        model.addRows([
          ['Metric', 'Value'],
          ['Exported records', rows.length],
          ['Numeric total', { formula: `SUM(Report!A2:${sheet.getColumn(columns.length).letter}${normalized.length + 1})` }],
          ['Model note', 'Use the Report sheet as the governed input table; assumptions belong on this sheet.'],
        ]);
        model.getRow(1).font = { bold: true };
      }
      const buffer = await workbook.xlsx.writeBuffer();
      return { buffer: Buffer.from(buffer), mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' };
    }
    if (format === 'pdf') {
      const pdf = new PDFDocument({ margin: 36, size: 'A4', layout: columns.length > 6 ? 'landscape' : 'portrait' });
      const chunks: Buffer[] = [];
      pdf.on('data', (chunk: Buffer) => chunks.push(chunk));
      const done = new Promise<Buffer>((resolve, reject) => {
        pdf.on('end', () => resolve(Buffer.concat(chunks)));
        pdf.on('error', reject);
      });
      pdf.fontSize(18).fillColor('#0f766e').text(reportTitle);
      pdf.moveDown(0.3).fontSize(8).fillColor('#475569').text(`Generated ${new Date().toLocaleString('en-UG')} · ${rows.length} records`);
      pdf.moveDown().fontSize(7).fillColor('#0f172a');
      const visible = columns.slice(0, 8);
      pdf.font('Helvetica-Bold').text(visible.join(' | '));
      pdf.font('Helvetica');
      for (const row of normalized.slice(0, 1000)) {
        if (pdf.y > pdf.page.height - 50) pdf.addPage();
        pdf.text(visible.map((column) => String(value(row[column])).slice(0, 28)).join(' | '), { lineGap: 2 });
      }
      pdf.end();
      return { buffer: await done, mimeType: 'application/pdf' };
    }
    if (format === 'docx') {
      const table = new Table({
        width: { size: 100, type: WidthType.PERCENTAGE },
        rows: [
          new TableRow({ children: columns.map((column) => new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: column.replaceAll('_', ' '), bold: true })] })] })) }),
          ...normalized.slice(0, 2000).map((row) => new TableRow({ children: columns.map((column) => new TableCell({ children: [new Paragraph(String(value(row[column])))] })) })),
        ],
      });
      const doc = new Document({ sections: [{ children: [
        new Paragraph({ text: reportTitle, heading: HeadingLevel.TITLE, alignment: AlignmentType.LEFT }),
        new Paragraph(`Generated ${new Date().toLocaleString('en-UG')} · ${rows.length} records`),
        table,
      ] }] });
      return { buffer: await Packer.toBuffer(doc), mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' };
    }

    const pptx = new PptxGenJS();
    pptx.author = 'CampusHomes';
    pptx.subject = reportTitle;
    pptx.layout = 'LAYOUT_WIDE';
    const cover = pptx.addSlide();
    cover.background = { color: '0B1F33' };
    cover.addText(reportTitle, { x: 0.7, y: 1.7, w: 11.8, h: 0.8, fontSize: 28, bold: true, color: 'FFFFFF' });
    cover.addText(`${rows.length} records · generated ${new Date().toLocaleString('en-UG')}`, { x: 0.7, y: 2.65, w: 11.5, h: 0.4, fontSize: 13, color: '99F6E4' });
    const visible = columns.slice(0, 8);
    for (let offset = 0; offset < normalized.length; offset += 16) {
      const slide = pptx.addSlide();
      slide.addText(`${reportTitle} · ${offset + 1}-${Math.min(offset + 16, normalized.length)}`, { x: 0.5, y: 0.3, w: 12, h: 0.4, fontSize: 18, bold: true, color: '0F766E' });
      slide.addTable([
        visible.map((column) => ({ text: column.replaceAll('_', ' '), options: { bold: true, color: 'FFFFFF', fill: { color: '0F766E' } } })),
        ...normalized.slice(offset, offset + 16).map((row) => visible.map((column) => ({ text: String(value(row[column])).slice(0, 60) }))),
      ], { x: 0.4, y: 0.9, w: 12.5, h: 6, fontSize: 8, border: { color: 'CBD5E1', pt: 0.5 }, margin: 0.04 });
    }
    const buffer = await pptx.write({ outputType: 'nodebuffer' });
    return { buffer: Buffer.from(buffer as Uint8Array), mimeType: 'application/vnd.openxmlformats-officedocument.presentationml.presentation' };
  }

  private async publishPowerBi(input: ReportExportRequestInput, rows: DataRow[]) {
    const env = loadEnv();
    if (!env.POWER_BI_PUSH_URL || !env.POWER_BI_API_TOKEN) {
      throw new ConflictException('Power BI is not configured. Add POWER_BI_PUSH_URL and POWER_BI_API_TOKEN to the API environment.');
    }
    const response = await fetch(env.POWER_BI_PUSH_URL, {
      method: 'POST',
      headers: { Authorization: `Bearer ${env.POWER_BI_API_TOKEN}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ reportType: input.reportType, generatedAt: new Date().toISOString(), rows }),
      signal: AbortSignal.timeout(15_000),
    });
    if (!response.ok) throw new BadGatewayException(`Power BI rejected the dataset with status ${response.status}`);
  }

  private createExportRecord(actor: RlsContext, input: ReportExportRequestInput, fileName: string): Promise<string> {
    return this.rlsDb.run(SERVICE_CTX, async (_db, client) => {
      const row = (await client.query<{ id: string }>(`
        INSERT INTO report_exports (report_type, format, destination, filters, status, file_name, created_by)
        VALUES ($1, $2, $3, $4::jsonb, 'pending', $5, $6) RETURNING id
      `, [input.reportType, input.destination === 'financial_model' ? 'xlsx' : input.format, input.destination, JSON.stringify(input), fileName, actor.userId])).rows[0]!;
      return row.id;
    });
  }

  private completeExport(exportId: string) {
    return this.rlsDb.run(SERVICE_CTX, async (_db, client) => {
      await client.query(`UPDATE report_exports SET status = 'completed', completed_at = now() WHERE id = $1`, [exportId]);
    });
  }

  private failExport(exportId: string, message: string) {
    return this.rlsDb.run(SERVICE_CTX, async (_db, client) => {
      await client.query(`UPDATE report_exports SET status = 'failed', error = $2 WHERE id = $1`, [exportId, message.slice(0, 1000)]);
    });
  }
}
