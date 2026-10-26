import { Body, Controller, Delete, Get, Headers, Param, ParseUUIDPipe, Patch, Post, Query, Req, UseGuards } from '@nestjs/common';

import { AuthGuard, type AuthenticatedRequest } from '../auth/auth.guard';
import { AllowPendingLandlord, Roles, RolesGuard, rlsCtx } from '../auth/roles';
import {
  AddPropertyDocumentDto,
  AddPropertyMediaDto,
  AddUnitPhotoDto,
  CreateDraftListingDto,
  ListingSearchDto,
  ListingReviewsQueryDto,
  ListingSearchPageDto,
  SetListingIntentDto,
  SubmitPropertyDto,
  UpdatePropertyDto,
  UpdateUnitOperationalStatusDto,
} from './listings.dto';
import { ListingsService } from './listings.service';

// k6 (scripts/load) identifies itself; skipping its searches only affects analytics.
const isLoadTest = (userAgent?: string) => userAgent?.startsWith('k6/') ?? false;

@Controller('listings')
export class ListingsController {
  constructor(private readonly listings: ListingsService) {}

  // ── public ─────────────────────────────────────────────────────────────────

  @Get('search')
  search(@Query() query: ListingSearchDto, @Headers('user-agent') userAgent?: string) {
    return this.listings.search(query, { logEvent: !isLoadTest(userAgent) });
  }

  @Get('search-page')
  searchPage(@Query() query: ListingSearchPageDto, @Headers('user-agent') userAgent?: string) {
    return this.listings.searchPage(query, { logEvent: !isLoadTest(userAgent) });
  }

  // Declared before the ':id' catch-all below — route order matters in Nest.
  @Get('campuses')
  campuses() {
    return this.listings.campuses();
  }

  @Get('reviews')
  reviews() {
    return this.listings.reviews(6);
  }

  @Get(':id/reviews')
  listingReviews(
    @Param('id', ParseUUIDPipe) id: string,
    @Query() query: ListingReviewsQueryDto,
  ) {
    return this.listings.listingReviews(id, query.page, query.limit);
  }

  // Support contact lives in the admin-only platform_settings table, but
  // students/the public need to see it (help/complaint routes) without
  // signing in — this exposes just that one value, nothing else from settings.
  @Get('support-contact')
  supportContact() {
    return this.listings.supportContact();
  }

  // Declared before the ':id' catch-all below — route order matters in Nest.
  @Get('semesters')
  @UseGuards(AuthGuard, RolesGuard)
  @Roles('landlord')
  semesters(@Req() req: AuthenticatedRequest, @Query('catchment') catchment?: string) {
    return this.listings.semestersForCatchment(rlsCtx(req), catchment);
  }

  @Get(':id')
  detail(@Param('id', ParseUUIDPipe) id: string) {
    return this.listings.detail(id);
  }

  // Public: the QR tenant-agreement landing page needs a property's name
  // before the visitor is even signed in.
  @Get('properties/:id/summary')
  propertySummary(@Param('id', ParseUUIDPipe) id: string) {
    return this.listings.propertySummary(id);
  }

  // ── landlord ───────────────────────────────────────────────────────────────

  @Post('properties')
  @UseGuards(AuthGuard, RolesGuard)
  @AllowPendingLandlord()
  @Roles('landlord')
  submitProperty(@Req() req: AuthenticatedRequest, @Body() body: SubmitPropertyDto) {
    return this.listings.submitProperty(rlsCtx(req), body);
  }

  @Get('properties/mine')
  @UseGuards(AuthGuard, RolesGuard)
  @AllowPendingLandlord()
  @Roles('landlord')
  myProperties(@Req() req: AuthenticatedRequest) {
    return this.listings.myProperties(rlsCtx(req));
  }

  @Patch('properties/:id/listing-intent')
  @UseGuards(AuthGuard, RolesGuard)
  @Roles('landlord')
  setListingIntent(
    @Req() req: AuthenticatedRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: SetListingIntentDto,
  ) {
    return this.listings.setListingIntent(rlsCtx(req), id, body.listingIntent);
  }

  @Patch('properties/:id')
  @UseGuards(AuthGuard, RolesGuard)
  @Roles('landlord')
  updateProperty(
    @Req() req: AuthenticatedRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: UpdatePropertyDto,
  ) {
    return this.listings.updateProperty(rlsCtx(req), id, body);
  }

  @Get('properties/:id/detail')
  @UseGuards(AuthGuard, RolesGuard)
  @Roles('landlord')
  propertyDetail(@Req() req: AuthenticatedRequest, @Param('id', ParseUUIDPipe) id: string) {
    return this.listings.propertyDetail(rlsCtx(req), id);
  }

  @Post('properties/:id/documents')
  @UseGuards(AuthGuard, RolesGuard)
  @Roles('landlord')
  addDocument(
    @Req() req: AuthenticatedRequest,
    @Param('id', ParseUUIDPipe) propertyId: string,
    @Body() body: AddPropertyDocumentDto,
  ) {
    return this.listings.addDocument(rlsCtx(req), propertyId, body.docType, body.storageKey);
  }

  @Post('drafts')
  @UseGuards(AuthGuard, RolesGuard)
  @Roles('landlord')
  createDraft(@Req() req: AuthenticatedRequest, @Body() body: CreateDraftListingDto) {
    return this.listings.createDraftListing(rlsCtx(req), body.propertyId, body.semesterId);
  }

  @Post('units/:id/photos')
  @UseGuards(AuthGuard, RolesGuard)
  @Roles('landlord')
  addUnitPhoto(
    @Req() req: AuthenticatedRequest,
    @Param('id', ParseUUIDPipe) unitId: string,
    @Body() body: AddUnitPhotoDto,
  ) {
    return this.listings.addUnitPhoto(rlsCtx(req), unitId, body.storageKey);
  }

  @Delete('units/photos/:photoId')
  @UseGuards(AuthGuard, RolesGuard)
  @Roles('landlord')
  removeUnitPhoto(@Req() req: AuthenticatedRequest, @Param('photoId', ParseUUIDPipe) photoId: string) {
    return this.listings.removeUnitPhoto(rlsCtx(req), photoId);
  }

  // Whole-property gallery photos (0026) — distinct from units/:id/photos
  // (per-room) and Ops-only listing photos.
  @Post('properties/:id/media')
  @UseGuards(AuthGuard, RolesGuard)
  @Roles('landlord')
  addPropertyMedia(
    @Req() req: AuthenticatedRequest,
    @Param('id', ParseUUIDPipe) propertyId: string,
    @Body() body: AddPropertyMediaDto,
  ) {
    return this.listings.addPropertyMedia(rlsCtx(req), propertyId, body.storageKey);
  }

  @Delete('properties/media/:mediaId')
  @UseGuards(AuthGuard, RolesGuard)
  @Roles('landlord')
  removePropertyMedia(@Req() req: AuthenticatedRequest, @Param('mediaId', ParseUUIDPipe) mediaId: string) {
    return this.listings.removePropertyMedia(rlsCtx(req), mediaId);
  }

  // Marks a room taken/free by hand — the landlord's one lever for a tenant
  // who never went through our own reservation flow (0024).
  @Patch('units/:id/operational-status')
  @UseGuards(AuthGuard, RolesGuard)
  @Roles('landlord')
  updateUnitOperationalStatus(
    @Req() req: AuthenticatedRequest,
    @Param('id', ParseUUIDPipe) unitId: string,
    @Body() body: UpdateUnitOperationalStatusDto,
  ) {
    return this.listings.updateUnitOperationalStatus(rlsCtx(req), unitId, body.operationalStatus);
  }
}
