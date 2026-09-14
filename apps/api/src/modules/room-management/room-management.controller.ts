import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, Query, Req, UseGuards } from '@nestjs/common';

import { AuthGuard, type AuthenticatedRequest } from '../auth/auth.guard';
import { Roles, RolesGuard, rlsCtx } from '../auth/roles';
import {
  BedBlockInputDto,
  BulkRoomInputDto,
  RejectRoomChangeSetDto,
  ReviewRoomChangeSetDto,
  RoomManagementQueryDto,
  RoomTypeInputDto,
  RoomUnitInputDto,
  SubmitRoomChangeSetDto,
  UnitBlockInputDto,
} from './room-management.dto';
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

  @Post('properties/:propertyId/rooms')
  createRoom(@Req() req: AuthenticatedRequest, @Param('propertyId', ParseUUIDPipe) propertyId: string, @Body() body: RoomUnitInputDto) {
    return this.rooms.createRoom(rlsCtx(req), propertyId, body);
  }

  @Post('properties/:propertyId/rooms/bulk')
  bulkRooms(@Req() req: AuthenticatedRequest, @Param('propertyId', ParseUUIDPipe) propertyId: string, @Body() body: BulkRoomInputDto) {
    return this.rooms.bulkCreateRooms(rlsCtx(req), propertyId, body);
  }

  @Patch('rooms/:roomId')
  updateRoom(@Req() req: AuthenticatedRequest, @Param('roomId', ParseUUIDPipe) roomId: string, @Body() body: RoomUnitInputDto) {
    return this.rooms.updateRoom(rlsCtx(req), roomId, body);
  }

  @Post('rooms/:roomId/archive')
  archiveRoom(@Req() req: AuthenticatedRequest, @Param('roomId', ParseUUIDPipe) roomId: string) {
    return this.rooms.archiveRoom(rlsCtx(req), roomId);
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
@UseGuards(AuthGuard, RolesGuard)
export class RoomManagementOpsController {
  constructor(private readonly rooms: RoomManagementService) {}

  @Get()
  @Roles('ops_lead', 'admin')
  queue(@Req() req: AuthenticatedRequest) {
    return this.rooms.reviewQueue(rlsCtx(req));
  }

  @Post(':changeSetId/approve')
  @Roles('ops_lead', 'admin')
  approve(@Req() req: AuthenticatedRequest, @Param('changeSetId', ParseUUIDPipe) changeSetId: string, @Body() body: ReviewRoomChangeSetDto) {
    return this.rooms.approveChangeSet(rlsCtx(req), changeSetId, body.notes);
  }

  @Post(':changeSetId/reject')
  @Roles('ops_lead', 'admin')
  reject(@Req() req: AuthenticatedRequest, @Param('changeSetId', ParseUUIDPipe) changeSetId: string, @Body() body: RejectRoomChangeSetDto) {
    return this.rooms.rejectChangeSet(rlsCtx(req), changeSetId, body.reason);
  }
}
