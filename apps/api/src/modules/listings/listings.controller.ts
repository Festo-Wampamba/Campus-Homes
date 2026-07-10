import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Query, Req, UseGuards } from '@nestjs/common';

import { AuthGuard, type AuthenticatedRequest } from '../auth/auth.guard';
import { Roles, RolesGuard, rlsCtx } from '../auth/roles';
import {
  AddPropertyDocumentDto,
  CreateDraftListingDto,
  ListingSearchDto,
  SubmitPropertyDto,
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

  @Get(':id')
  detail(@Param('id', ParseUUIDPipe) id: string) {
    return this.listings.detail(id);
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
}
