import { Body, Controller, ForbiddenException, Get, Post, Req, Res, StreamableFile, UseGuards } from '@nestjs/common';
import type { Response } from 'express';
import { createZodDto } from 'nestjs-zod';

import { reportExportRequestSchema, verificationExportRequestSchema } from '@campushomes/shared';

import { AuthGuard } from '../auth/auth.guard';
import { PermissionedRequest, PermissionsGuard, RequirePermission } from '../auth/permissions';
import { rlsCtx } from '../auth/roles';
import { AdminExportsService, type ExportResult } from './admin-exports.service';

class ReportExportDto extends createZodDto(reportExportRequestSchema) {}
class VerificationExportDto extends createZodDto(verificationExportRequestSchema) {}

@Controller('admin')
@UseGuards(AuthGuard, PermissionsGuard)
export class AdminExportsController {
  constructor(private readonly exports: AdminExportsService) {}

  @Get('reports/exports')
  @RequirePermission('analytics.read')
  history() {
    return this.exports.history();
  }

  @Post('reports/export')
  @RequirePermission('reports.export')
  async report(
    @Req() req: PermissionedRequest,
    @Res({ passthrough: true }) response: Response,
    @Body() body: ReportExportDto,
  ) {
    if (body.destination === 'power_bi' && !req.permissions.has('reports.publish_powerbi')) {
      throw new ForbiddenException('Publishing to Power BI requires reports.publish_powerbi');
    }
    return this.respond(response, await this.exports.generate(rlsCtx(req), body));
  }

  @Post('verifications/export')
  @RequirePermission('verifications.export')
  async verifications(
    @Req() req: PermissionedRequest,
    @Res({ passthrough: true }) response: Response,
    @Body() body: VerificationExportDto,
  ) {
    return this.respond(response, await this.exports.generate(rlsCtx(req), { ...body, reportType: 'verifications' }));
  }

  private respond(response: Response, result: ExportResult) {
    if (result.kind === 'published') return result;
    response.setHeader('Content-Type', result.mimeType);
    response.setHeader('Content-Disposition', `attachment; filename="${result.fileName}"`);
    return new StreamableFile(result.buffer);
  }
}
