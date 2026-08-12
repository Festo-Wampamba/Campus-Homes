import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Req, UseGuards } from '@nestjs/common';

import { AuthGuard, type AuthenticatedRequest } from '../auth/auth.guard';
import { Roles, RolesGuard, rlsCtx } from '../auth/roles';
import type { University } from '@campushomes/shared';

import {
  CreateOpsDraftListingDto,
  IssueStrikeDto,
  OpsKycDecisionDto,
  PublishListingDto,
  ScheduleVisitDto,
  SetCampusPhotoDto,
  SyncVisitDto,
} from './ops.dto';
import { OpsService } from './ops.service';

@Controller('ops')
@UseGuards(AuthGuard, RolesGuard)
export class OpsController {
  constructor(private readonly ops: OpsService) {}

  @Get('queue')
  @Roles('ops_inspector', 'ops_lead', 'admin')
  queue(@Req() req: AuthenticatedRequest) {
    return this.ops.queue(rlsCtx(req));
  }

  @Get('inspectors')
  @Roles('ops_lead', 'admin')
  listInspectors(@Req() req: AuthenticatedRequest) {
    return this.ops.listInspectors(rlsCtx(req));
  }

  @Get('visits/mine')
  @Roles('ops_inspector')
  myVisits(@Req() req: AuthenticatedRequest) {
    return this.ops.myVisits(rlsCtx(req));
  }

  @Get('visits/:id')
  @Roles('ops_lead', 'admin')
  visitDetail(@Req() req: AuthenticatedRequest, @Param('id', ParseUUIDPipe) id: string) {
    return this.ops.visitDetail(rlsCtx(req), id);
  }

  @Get('properties/:id/listings')
  @Roles('ops_lead', 'admin')
  propertyListings(@Req() req: AuthenticatedRequest, @Param('id', ParseUUIDPipe) id: string) {
    return this.ops.propertyListings(rlsCtx(req), id);
  }

  @Get('listings/:id')
  @Roles('ops_lead', 'admin')
  listingForPublish(@Req() req: AuthenticatedRequest, @Param('id', ParseUUIDPipe) id: string) {
    return this.ops.listingForPublish(rlsCtx(req), id);
  }

  @Get('properties/:id/publishable-semesters')
  @Roles('ops_lead', 'admin')
  publishableSemesters(@Req() req: AuthenticatedRequest, @Param('id', ParseUUIDPipe) id: string) {
    return this.ops.publishableSemesters(rlsCtx(req), id);
  }

  // Creates the draft listing a landlord-onboarded property never gets, so the
  // lead can publish after approving a passed visit.
  @Post('listings/draft')
  @Roles('ops_lead', 'admin')
  createDraftListing(@Req() req: AuthenticatedRequest, @Body() body: CreateOpsDraftListingDto) {
    return this.ops.createDraftListing(rlsCtx(req), body);
  }

  @Post('visits')
  @Roles('ops_lead', 'admin')
  scheduleVisit(@Req() req: AuthenticatedRequest, @Body() body: ScheduleVisitDto) {
    return this.ops.scheduleVisit(rlsCtx(req), body);
  }

  // Offline-sync drain target (§9 flow 2) — inspector-only, idempotency-keyed.
  @Post('visits/sync')
  @Roles('ops_inspector')
  syncVisit(@Req() req: AuthenticatedRequest, @Body() body: SyncVisitDto) {
    return this.ops.syncVisit(rlsCtx(req), body);
  }

  @Post('visits/:id/approve')
  @Roles('ops_lead', 'admin')
  approveVisit(@Req() req: AuthenticatedRequest, @Param('id', ParseUUIDPipe) id: string) {
    return this.ops.approveVisit(rlsCtx(req), id);
  }

  @Post('listings/publish')
  @Roles('ops_lead', 'admin')
  publishListing(@Req() req: AuthenticatedRequest, @Body() body: PublishListingDto) {
    return this.ops.publishListing(rlsCtx(req), body);
  }

  @Post('campuses/:university/photo')
  @Roles('ops_lead', 'admin')
  setCampusPhoto(
    @Req() req: AuthenticatedRequest,
    @Param('university') university: string,
    @Body() body: SetCampusPhotoDto,
  ) {
    return this.ops.setCampusPhoto(rlsCtx(req), university as University, body.storageKey);
  }

  @Post('strikes')
  @Roles('ops_lead', 'admin')
  issueStrike(@Req() req: AuthenticatedRequest, @Body() body: IssueStrikeDto) {
    return this.ops.issueStrike(rlsCtx(req), body);
  }

  @Get('landlords/kyc-queue')
  @Roles('ops_lead', 'admin')
  kycQueue(@Req() req: AuthenticatedRequest) {
    return this.ops.kycQueue(rlsCtx(req));
  }

  @Post('landlords/:userId/kyc')
  @Roles('ops_lead', 'admin')
  decideKyc(
    @Req() req: AuthenticatedRequest,
    @Param('userId', ParseUUIDPipe) userId: string,
    @Body() body: OpsKycDecisionDto,
  ) {
    return this.ops.decideKyc(rlsCtx(req), userId, body);
  }
}
