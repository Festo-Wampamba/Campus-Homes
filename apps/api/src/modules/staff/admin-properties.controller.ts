import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Patch, Post, Req, UseGuards } from '@nestjs/common';
import { createZodDto } from 'nestjs-zod';

import {
  addAdminPropertyMediaSchema,
  addAdminPropertyUnitsSchema,
  createAdminPropertySchema,
  updateAdminPropertySchema,
} from '@campushomes/shared';

import { AuthGuard } from '../auth/auth.guard';
import { PermissionedRequest, PermissionsGuard, RequirePermission } from '../auth/permissions';
import { rlsCtx } from '../auth/roles';
import { AdminPropertiesService } from './admin-properties.service';

class CreateAdminPropertyDto extends createZodDto(createAdminPropertySchema) {}
class UpdateAdminPropertyDto extends createZodDto(updateAdminPropertySchema) {}
class AddAdminPropertyUnitsDto extends createZodDto(addAdminPropertyUnitsSchema) {}
class AddAdminPropertyMediaDto extends createZodDto(addAdminPropertyMediaSchema) {}

@Controller('admin/properties')
@UseGuards(AuthGuard, PermissionsGuard)
export class AdminPropertiesController {
  constructor(private readonly properties: AdminPropertiesService) {}

  @Post()
  @RequirePermission('properties.create')
  create(@Req() req: PermissionedRequest, @Body() body: CreateAdminPropertyDto) {
    return this.properties.create(rlsCtx(req), body);
  }

  @Get(':id')
  @RequirePermission('properties.read')
  detail(@Param('id', ParseUUIDPipe) id: string) {
    return this.properties.detail(id);
  }

  @Patch(':id')
  @RequirePermission('properties.update')
  update(
    @Req() req: PermissionedRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: UpdateAdminPropertyDto,
  ) {
    return this.properties.update(rlsCtx(req), id, body);
  }

  @Post(':id/units')
  @RequirePermission('property_units.manage')
  addUnits(
    @Req() req: PermissionedRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: AddAdminPropertyUnitsDto,
  ) {
    return this.properties.addUnits(rlsCtx(req), id, body);
  }

  @Post(':id/media')
  @RequirePermission('property_media.manage')
  addMedia(
    @Req() req: PermissionedRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: AddAdminPropertyMediaDto,
  ) {
    return this.properties.addMedia(rlsCtx(req), id, body);
  }

  @Delete(':id/media/:mediaId')
  @RequirePermission('property_media.manage')
  removeMedia(
    @Req() req: PermissionedRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('mediaId', ParseUUIDPipe) mediaId: string,
  ) {
    return this.properties.removeMedia(rlsCtx(req), id, mediaId);
  }
}
