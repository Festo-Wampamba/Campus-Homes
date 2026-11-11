import { BadRequestException, Body, Controller, Delete, Get, Param, ParseUUIDPipe, Patch, Post, Query, Req, Res, StreamableFile, UseGuards } from '@nestjs/common';
import type { Response } from 'express';

import { AuthGuard, type AuthenticatedRequest } from '../auth/auth.guard';
import { PermissionsGuard, RequireAnyPermission, RequirePermission } from '../auth/permissions';
import { Roles, RolesGuard, rlsCtx } from '../auth/roles';
import {
  SaveOpsSpecificationsDto,
  BatchRoomDeleteDto,
  BatchRoomUpdateDto,
  BedBlockInputDto,
  BulkRoomInputDto,
  RejectManagedPropertyDto,
  RejectRoomChangeSetDto,
  ReviewRoomChangeSetDto,
  RoomManagementQueryDto,
  RoomTypeInputDto,
  RoomUnitInputDto,
  SubmitRoomChangeSetDto,
  UnitBlockInputDto,
} from './room-management.dto';
import { parseRoomSheet } from './room-import';
import { RoomManagementService } from './room-management.service';

@Controller('room-management')
@UseGuards(AuthGuard, RolesGuard)
@Roles('landlord')
export class RoomManagementController {
  constructor(private readonly rooms: RoomManagementService) {}

  @Get()
  overview(@Req() req: AuthenticatedRequest, @Query() query: RoomManagementQueryDto) {
    return this.rooms.overview(rlsCtx(req), query.propertyId, query.semesterId);
  }

  @Post('properties/:propertyId/room-types')
  createRoomType(@Req() req: AuthenticatedRequest, @Param('propertyId', ParseUUIDPipe) propertyId: string, @Body() body: RoomTypeInputDto) {
    return this.rooms.createRoomType(rlsCtx(req), propertyId, body);
  }

  @Patch('room-types/:roomTypeId')
  updateRoomType(@Req() req: AuthenticatedRequest, @Param('roomTypeId', ParseUUIDPipe) roomTypeId: string, @Body() body: RoomTypeInputDto) {
    return this.rooms.updateRoomType(rlsCtx(req), roomTypeId, body);
  }

  @Delete('room-types/:roomTypeId')
  deleteRoomType(@Req() req: AuthenticatedRequest, @Param('roomTypeId', ParseUUIDPipe) roomTypeId: string) {
    return this.rooms.deleteRoomType(rlsCtx(req), roomTypeId);
  }

  @Post('properties/:propertyId/rooms')
  createRoom(@Req() req: AuthenticatedRequest, @Param('propertyId', ParseUUIDPipe) propertyId: string, @Body() body: RoomUnitInputDto) {
    return this.rooms.createRoom(rlsCtx(req), propertyId, body);
  }

  @Post('properties/:propertyId/rooms/batch-update')
  batchUpdateRooms(@Req() req: AuthenticatedRequest, @Param('propertyId', ParseUUIDPipe) propertyId: string, @Body() body: BatchRoomUpdateDto) {
    return this.rooms.batchUpdateRooms(rlsCtx(req), propertyId, body);
  }

  @Post('properties/:propertyId/rooms/delete')
  deleteRooms(@Req() req: AuthenticatedRequest, @Param('propertyId', ParseUUIDPipe) propertyId: string, @Body() body: BatchRoomDeleteDto) {
    return this.rooms.deleteRooms(rlsCtx(req), propertyId, body);
  }

  @Post('properties/:propertyId/rooms/bulk')
  bulkRooms(@Req() req: AuthenticatedRequest, @Param('propertyId', ParseUUIDPipe) propertyId: string, @Body() body: BulkRoomInputDto) {
    return this.rooms.bulkCreateRooms(rlsCtx(req), propertyId, body);
  }

  /** Spreadsheet upload: the raw file (Excel or CSV) arrives as
   * application/octet-stream (see main.ts). Returns its rows for the
   * landlord to review; staging still goes through rooms/bulk. */
  @Post('rooms/import/parse')
  async parseImport(@Body() body: unknown) {
    if (!Buffer.isBuffer(body)) throw new BadRequestException('Send the file as application/octet-stream');
    return { rows: await parseRoomSheet(body) };
  }

  @Get('properties/:propertyId/rooms/import/template')
  async importTemplate(
    @Req() req: AuthenticatedRequest,
    @Param('propertyId', ParseUUIDPipe) propertyId: string,
    @Query('format') format: string | undefined,
    @Query('semesterId', new ParseUUIDPipe({ optional: true })) semesterId: string | undefined,
    @Res({ passthrough: true }) response: Response,
  ) {
    const file = await this.rooms.importTemplate(rlsCtx(req), propertyId, format === 'csv' ? 'csv' : 'xlsx', semesterId);
    response.setHeader('Content-Type', file.mimeType);
    response.setHeader('Content-Disposition', `attachment; filename="${file.fileName}"`);
    return new StreamableFile(file.buffer);
  }

  @Patch('rooms/:roomId')
  updateRoom(@Req() req: AuthenticatedRequest, @Param('roomId', ParseUUIDPipe) roomId: string, @Body() body: RoomUnitInputDto) {
    return this.rooms.updateRoom(rlsCtx(req), roomId, body);
  }

  @Post('rooms/:roomId/blocks')
  blockRoom(@Req() req: AuthenticatedRequest, @Param('roomId', ParseUUIDPipe) roomId: string, @Body() body: UnitBlockInputDto) {
    return this.rooms.blockRoom(rlsCtx(req), roomId, body);
  }

  @Post('rooms/:roomId/blocks/:blockId/clear')
  clearBlock(@Req() req: AuthenticatedRequest, @Param('roomId', ParseUUIDPipe) roomId: string, @Param('blockId', ParseUUIDPipe) blockId: string) {
    return this.rooms.clearBlock(rlsCtx(req), roomId, blockId);
  }

  @Patch('rooms/:roomId/beds/:bedId/block')
  blockBed(@Req() req: AuthenticatedRequest, @Param('roomId', ParseUUIDPipe) roomId: string, @Param('bedId', ParseUUIDPipe) bedId: string, @Body() body: BedBlockInputDto) {
    return this.rooms.blockBed(rlsCtx(req), roomId, bedId, body);
  }

  @Post('change-sets/:changeSetId/submit')
  submit(@Req() req: AuthenticatedRequest, @Param('changeSetId', ParseUUIDPipe) changeSetId: string, @Body() body: SubmitRoomChangeSetDto) {
    return this.rooms.submitChangeSet(rlsCtx(req), changeSetId, body.notes);
  }

  @Post('change-sets/:changeSetId/cancel')
  cancel(@Req() req: AuthenticatedRequest, @Param('changeSetId', ParseUUIDPipe) changeSetId: string) {
    return this.rooms.cancelChangeSet(rlsCtx(req), changeSetId);
  }
}

@Controller('ops/room-change-requests')
@UseGuards(AuthGuard, PermissionsGuard, RolesGuard)
export class RoomManagementOpsController {
  constructor(private readonly rooms: RoomManagementService) {}

  @Get()
  @Roles('ops_lead', 'admin')
  @RequirePermission('room_changes.review')
  queue(@Req() req: AuthenticatedRequest) {
    return this.rooms.reviewQueue(rlsCtx(req));
  }

  @Post('properties/:propertyId/specifications')
  @Roles('ops_lead', 'admin')
  @RequirePermission('room_changes.review')
  specifications(@Req() req: AuthenticatedRequest, @Param('propertyId', ParseUUIDPipe) propertyId: string, @Body() body: SaveOpsSpecificationsDto) {
    return this.rooms.saveOpsSpecifications(rlsCtx(req), propertyId, body.types);
  }

  @Get('activity')
  @Roles('ops_lead', 'admin')
  @RequirePermission('room_changes.review')
  activity(@Req() req: AuthenticatedRequest) {
    return this.rooms.activity(rlsCtx(req));
  }

  @Post(':changeSetId/approve')
  @Roles('ops_lead', 'admin')
  @RequirePermission('room_changes.review')
  approve(@Req() req: AuthenticatedRequest, @Param('changeSetId', ParseUUIDPipe) changeSetId: string, @Body() body: ReviewRoomChangeSetDto) {
    return this.rooms.approveChangeSet(rlsCtx(req), changeSetId, body.notes);
  }

  @Post(':changeSetId/reject')
  @Roles('ops_lead', 'admin')
  @RequirePermission('room_changes.review')
  reject(@Req() req: AuthenticatedRequest, @Param('changeSetId', ParseUUIDPipe) changeSetId: string, @Body() body: RejectRoomChangeSetDto) {
    return this.rooms.rejectChangeSet(rlsCtx(req), changeSetId, body.reason);
  }
}

// Ops approval of manage-only properties (Festo, 2026-11-01). Leads approve;
// inspectors may open the list to check a property's location first.
@Controller('ops/managed-properties')
@UseGuards(AuthGuard, PermissionsGuard, RolesGuard)
export class ManagedPropertiesOpsController {
  constructor(private readonly rooms: RoomManagementService) {}

  @Get()
  @Roles('ops_inspector', 'ops_lead', 'admin')
  @RequireAnyPermission('room_changes.review', 'visits.inspect')
  queue(@Req() req: AuthenticatedRequest) {
    return this.rooms.managedPropertyQueue(rlsCtx(req));
  }

  @Post(':propertyId/approve')
  @Roles('ops_lead', 'admin')
  @RequirePermission('room_changes.review')
  approve(@Req() req: AuthenticatedRequest, @Param('propertyId', ParseUUIDPipe) propertyId: string) {
    return this.rooms.approveManagedProperty(rlsCtx(req), propertyId);
  }

  @Post(':propertyId/reject')
  @Roles('ops_lead', 'admin')
  @RequirePermission('room_changes.review')
  reject(@Req() req: AuthenticatedRequest, @Param('propertyId', ParseUUIDPipe) propertyId: string, @Body() body: RejectManagedPropertyDto) {
    return this.rooms.rejectManagedProperty(rlsCtx(req), propertyId, body.reason);
  }
}
