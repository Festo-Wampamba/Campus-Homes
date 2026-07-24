import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { createZodDto } from 'nestjs-zod';

import { createActivitySchema, updateActivitySchema } from '@campushomes/shared';

import { AuthGuard } from '../auth/auth.guard';
import { PermissionedRequest, PermissionsGuard, RequireAnyPermission, RequirePermission } from '../auth/permissions';
import { rlsCtx } from '../auth/roles';
import { AdminActivitiesService } from './admin-activities.service';
import { StaffService } from './staff.service';

class CreateActivityDto extends createZodDto(createActivitySchema) {}
class UpdateActivityDto extends createZodDto(updateActivitySchema) {}

@Controller('admin/activities')
@UseGuards(AuthGuard, PermissionsGuard)
export class AdminActivitiesController {
  constructor(
    private readonly activities: AdminActivitiesService,
    private readonly staff: StaffService,
  ) {}

  @Get()
  @RequireAnyPermission('activities.manage', 'activities.read')
  list(@Query('from') from?: string, @Query('to') to?: string) {
    return this.activities.list(from, to);
  }

  // The assignee picker needs the same staff roster StaffController already
  // exposes at /admin/staff — reused here instead of duplicating the query,
  // scoped to whichever permission already gates this controller so a
  // manager without staff.read can still assign activities.
  @Get('assignees')
  @RequireAnyPermission('activities.manage', 'activities.read')
  assignees() {
    return this.staff.list();
  }

  @Post()
  @RequirePermission('activities.manage')
  create(@Req() req: PermissionedRequest, @Body() body: CreateActivityDto) {
    return this.activities.create(rlsCtx(req), body);
  }

  @Patch(':id')
  @RequirePermission('activities.manage')
  update(@Param('id', ParseUUIDPipe) id: string, @Body() body: UpdateActivityDto) {
    return this.activities.update(id, body);
  }

  @Delete(':id')
  @RequirePermission('activities.manage')
  remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.activities.remove(id);
  }
}
