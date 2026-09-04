import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, Query, Req, UseGuards } from '@nestjs/common';

import { AuthGuard, type AuthenticatedRequest } from '../auth/auth.guard';
import { Roles, RolesGuard, rlsCtx } from '../auth/roles';
import type { University } from '@campushomes/shared';

import {
  AddListingPhotosDto,
  CreateOpsDraftListingDto,
  InviteLandlordDto,
  IssueStrikeDto,
  OpsKycDecisionDto,
  PublishListingDto,
  RaiseVisitCorrectionDto,
  ResolveVisitCorrectionDto,
  ScheduleVisitDto,
  SetCampusPhotoDto,
  SyncVisitDto,
  UpdateLeadStatusDto,
  UpdateUnitOperationalStatusDto,
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

  // ops_lead included (MVP: a lead can run a visit end-to-end without a
  // separate inspector) — both queries filter on inspector_id = ctx.userId,
  // so this only ever surfaces visits the caller assigned to themselves.
  @Get('visits/mine')
  @Roles('ops_inspector', 'ops_lead', 'admin')
  myVisits(@Req() req: AuthenticatedRequest) {
    return this.ops.myVisits(rlsCtx(req));
  }

  // The reviewed half of myVisits() — an inspector's own visits the lead has
  // already approved, so an approval doesn't just vanish from their world.
  @Get('visits/mine/history')
  @Roles('ops_inspector', 'ops_lead', 'admin')
  myVisitHistory(@Req() req: AuthenticatedRequest) {
    return this.ops.myVisitHistory(rlsCtx(req));
  }

  // ops_inspector included: RLS (visits_read) already scopes this to the
  // caller's own visit or a lead, so opening the role guard doesn't widen
  // access — it just lets an inspector read the server-truth record for a
  // visit they can no longer see in myVisits() once it's approved.
  @Get('visits/:id')
  @Roles('ops_lead', 'admin', 'ops_inspector')
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

  // Backfills listing_photos on an already-published listing — for an
  // inspector who skipped photos at visit time, publish is a one-shot
  // promotion of whatever the visit staged and never revisits it.
  @Post('listings/:id/photos')
  @Roles('ops_lead', 'admin')
  addListingPhotos(
    @Req() req: AuthenticatedRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: AddListingPhotosDto,
  ) {
    return this.ops.addListingPhotos(rlsCtx(req), id, body.storageKeys);
  }

  @Get('properties/:id/publishable-semesters')
  @Roles('ops_lead', 'admin')
  publishableSemesters(@Req() req: AuthenticatedRequest, @Param('id', ParseUUIDPipe) id: string) {
    return this.ops.publishableSemesters(rlsCtx(req), id);
  }

  // Rooms are permanent/property-level (2026-09) — this is what lets the
  // publish form default to "these already exist" instead of re-typing the
  // whole room list every semester. semesterId is required so the response
  // can carry back whether each room already has a price for it.
  @Get('properties/:id/rooms')
  @Roles('ops_lead', 'admin')
  propertyRooms(
    @Req() req: AuthenticatedRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Query('semesterId', ParseUUIDPipe) semesterId: string,
  ) {
    return this.ops.propertyRooms(rlsCtx(req), id, semesterId);
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

  // Offline-sync drain target (§9 flow 2), idempotency-keyed. ops_lead
  // included (MVP full-parity decision) so a lead can complete the
  // checklist on a visit they self-assigned, with no inspector involved.
  @Post('visits/sync')
  @Roles('ops_inspector', 'ops_lead', 'admin')
  syncVisit(@Req() req: AuthenticatedRequest, @Body() body: SyncVisitDto) {
    return this.ops.syncVisit(rlsCtx(req), body);
  }

  // Marks a room taken/free by hand — Ops's side of the same off-platform-
  // tenant gap the landlord endpoint covers (0024).
  @Patch('units/:id/operational-status')
  @Roles('ops_inspector', 'ops_lead', 'admin')
  updateUnitOperationalStatus(
    @Req() req: AuthenticatedRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: UpdateUnitOperationalStatusDto,
  ) {
    return this.ops.updateUnitOperationalStatus(rlsCtx(req), id, body.operationalStatus);
  }

  @Post('visits/:id/approve')
  @Roles('ops_lead', 'admin')
  approveVisit(@Req() req: AuthenticatedRequest, @Param('id', ParseUUIDPipe) id: string) {
    return this.ops.approveVisit(rlsCtx(req), id);
  }

  // Sends one checklist component back to the assigned inspector (0029) —
  // never the landlord, this data is inspector-captured.
  @Post('visits/:id/corrections')
  @Roles('ops_lead', 'admin')
  raiseVisitCorrection(
    @Req() req: AuthenticatedRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: RaiseVisitCorrectionDto,
  ) {
    return this.ops.raiseVisitCorrection(rlsCtx(req), id, body);
  }

  // The assigned inspector fixes a flagged component and resubmits it.
  // ops_lead/admin included for the same MVP full-parity reason as
  // syncVisit — the service layer still enforces the caller is the actual
  // assigned inspector for a real correction to resolve.
  @Patch('visits/:id/checklist-item')
  @Roles('ops_inspector', 'ops_lead', 'admin')
  resolveVisitCorrection(
    @Req() req: AuthenticatedRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: ResolveVisitCorrectionDto,
  ) {
    return this.ops.resolveVisitCorrection(rlsCtx(req), id, body);
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

  // Public "Request onboarding" queue (0027).
  @Get('leads')
  @Roles('ops_lead', 'admin')
  leadsQueue(@Req() req: AuthenticatedRequest) {
    return this.ops.leadsQueue(rlsCtx(req));
  }

  @Patch('leads/:id')
  @Roles('ops_lead', 'admin')
  updateLeadStatus(
    @Req() req: AuthenticatedRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: UpdateLeadStatusDto,
  ) {
    return this.ops.updateLeadStatus(rlsCtx(req), id, body.status);
  }

  // Self-serve landlord registration invite — emails a set-password
  // link instead of requiring an in-person concierge visit.
  @Post('landlords/invite')
  @Roles('ops_lead', 'admin')
  inviteLandlord(@Req() req: AuthenticatedRequest, @Body() body: InviteLandlordDto) {
    return this.ops.inviteLandlord(rlsCtx(req), body);
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
