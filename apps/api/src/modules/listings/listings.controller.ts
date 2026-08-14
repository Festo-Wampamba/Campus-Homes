import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Patch, Post, Query, Req, UseGuards } from '@nestjs/common';

import { AuthGuard, type AuthenticatedRequest } from '../auth/auth.guard';
import { Roles, RolesGuard, rlsCtx } from '../auth/roles';
import {
  AddPropertyDocumentDto,
  AddUnitPhotoDto,
  CreateDraftListingDto,
  ListingSearchDto,
  SubmitPropertyDto,
  UpdatePropertyDto,
} from './listings.dto';
import { ListingsService } from './listings.service';

@Controller('listings')
export class ListingsController {
  constructor(private readonly listings: ListingsService) {}

  // ── public ─────────────────────────────────────────────────────────────────

  @Get('search')
  search(@Query() query: ListingSearchDto) {
    return this.listings.search(query);
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
  @Roles('landlord')
  submitProperty(@Req() req: AuthenticatedRequest, @Body() body: SubmitPropertyDto) {
    return this.listings.submitProperty(rlsCtx(req), body);
  }

  @Get('properties/mine')
  @UseGuards(AuthGuard, RolesGuard)
  @Roles('landlord')
  myProperties(@Req() req: AuthenticatedRequest) {
    return this.listings.myProperties(rlsCtx(req));
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
}
