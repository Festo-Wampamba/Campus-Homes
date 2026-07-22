import { Body, Controller, Delete, Param, ParseUUIDPipe, Patch, Post, Req, UseGuards } from '@nestjs/common';
import { createZodDto } from 'nestjs-zod';

import {
  createIntegrationSchema,
  createSemesterSchema,
  platformSettingsUpdateSchema,
  updateIntegrationSchema,
  updateSemesterSchema,
} from '@campushomes/shared';

import { AuthGuard } from '../auth/auth.guard';
import { PermissionedRequest, PermissionsGuard, RequirePermission } from '../auth/permissions';
import { rlsCtx } from '../auth/roles';
import { AdminConfigService } from './admin-config.service';

class UpdateSettingsDto extends createZodDto(platformSettingsUpdateSchema) {}
class CreateSemesterDto extends createZodDto(createSemesterSchema) {}
class UpdateSemesterDto extends createZodDto(updateSemesterSchema) {}
class CreateIntegrationDto extends createZodDto(createIntegrationSchema) {}
class UpdateIntegrationDto extends createZodDto(updateIntegrationSchema) {}

@Controller('admin')
@UseGuards(AuthGuard, PermissionsGuard)
export class AdminConfigController {
  constructor(private readonly config: AdminConfigService) {}

  @Patch('settings')
  @RequirePermission('settings.manage')
  updateSettings(@Req() req: PermissionedRequest, @Body() body: UpdateSettingsDto) {
    return this.config.updateSettings(rlsCtx(req), body);
  }

  @Post('settings/semesters')
  @RequirePermission('semesters.manage')
  createSemester(@Req() req: PermissionedRequest, @Body() body: CreateSemesterDto) {
    return this.config.createSemester(rlsCtx(req), body);
  }

  @Patch('settings/semesters/:id')
  @RequirePermission('semesters.manage')
  updateSemester(
    @Req() req: PermissionedRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: UpdateSemesterDto,
  ) {
    return this.config.updateSemester(rlsCtx(req), id, body);
  }

  @Delete('settings/semesters/:id')
  @RequirePermission('semesters.manage')
  deleteSemester(@Req() req: PermissionedRequest, @Param('id', ParseUUIDPipe) id: string) {
    return this.config.deleteSemester(rlsCtx(req), id);
  }

  @Post('integrations')
  @RequirePermission('integrations.add')
  createIntegration(@Req() req: PermissionedRequest, @Body() body: CreateIntegrationDto) {
    return this.config.createIntegration(rlsCtx(req), body);
  }

  @Patch('integrations/:id')
  @RequirePermission('integrations.update')
  updateIntegration(
    @Req() req: PermissionedRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: UpdateIntegrationDto,
  ) {
    return this.config.updateIntegration(rlsCtx(req), id, body);
  }

  @Delete('integrations/:id')
  @RequirePermission('integrations.delete')
  deleteIntegration(@Req() req: PermissionedRequest, @Param('id', ParseUUIDPipe) id: string) {
    return this.config.deleteIntegration(rlsCtx(req), id);
  }
}
