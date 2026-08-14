import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Put, Req, Res, StreamableFile, UseGuards } from '@nestjs/common';
import type { Response } from 'express';

import { AuthGuard, type AuthenticatedRequest } from '../auth/auth.guard';
import { Roles, RolesGuard, rlsCtx } from '../auth/roles';
import { SaveTenantAgreementTemplateDto, SubmitTenantAgreementDto } from './tenant-agreements.dto';
import { TenantAgreementsService } from './tenant-agreements.service';

@Controller('tenant-agreements')
export class TenantAgreementsController {
  constructor(private readonly tenantAgreements: TenantAgreementsService) {}

  // Public: the QR landing page needs this before the visitor is
  // necessarily signed in.
  @Get('template/:propertyId')
  getTemplateForFill(@Param('propertyId', ParseUUIDPipe) propertyId: string) {
    return this.tenantAgreements.getTemplateForFill(propertyId);
  }

  @Get('template/:propertyId/edit')
  @UseGuards(AuthGuard, RolesGuard)
  @Roles('landlord', 'custodian', 'ops_lead', 'admin')
  getTemplateForEdit(@Req() req: AuthenticatedRequest, @Param('propertyId', ParseUUIDPipe) propertyId: string) {
    return this.tenantAgreements.getTemplateForEdit(rlsCtx(req), propertyId);
  }

  @Get('template/:propertyId/pdf')
  @UseGuards(AuthGuard, RolesGuard)
  @Roles('landlord', 'custodian', 'ops_lead', 'admin')
  async downloadTemplatePdf(
    @Req() req: AuthenticatedRequest,
    @Param('propertyId', ParseUUIDPipe) propertyId: string,
    @Res({ passthrough: true }) response: Response,
  ) {
    const { buffer, fileName } = await this.tenantAgreements.generateTemplatePdf(rlsCtx(req), propertyId);
    response.setHeader('Content-Type', 'application/pdf');
    response.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
    return new StreamableFile(buffer);
  }

  @Put('template/:propertyId')
  @UseGuards(AuthGuard, RolesGuard)
  @Roles('landlord', 'custodian', 'ops_lead', 'admin')
  saveTemplate(
    @Req() req: AuthenticatedRequest,
    @Param('propertyId', ParseUUIDPipe) propertyId: string,
    @Body() body: SaveTenantAgreementTemplateDto,
  ) {
    return this.tenantAgreements.saveTemplate(rlsCtx(req), propertyId, body);
  }

  @Post()
  @UseGuards(AuthGuard, RolesGuard)
  @Roles('student')
  submit(@Req() req: AuthenticatedRequest, @Body() body: SubmitTenantAgreementDto) {
    return this.tenantAgreements.submit(rlsCtx(req), body);
  }

  // The agreement page's own "have I already signed for this property?" check.
  @Get('mine/:propertyId')
  @UseGuards(AuthGuard, RolesGuard)
  @Roles('student')
  mine(@Req() req: AuthenticatedRequest, @Param('propertyId', ParseUUIDPipe) propertyId: string) {
    return this.tenantAgreements.mine(rlsCtx(req), propertyId);
  }

  @Get('property/:propertyId')
  @UseGuards(AuthGuard, RolesGuard)
  @Roles('landlord', 'custodian', 'ops_lead', 'admin')
  forProperty(@Req() req: AuthenticatedRequest, @Param('propertyId', ParseUUIDPipe) propertyId: string) {
    return this.tenantAgreements.forProperty(rlsCtx(req), propertyId);
  }
}
