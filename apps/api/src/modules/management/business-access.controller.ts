import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { createZodDto } from 'nestjs-zod';
import {
  governanceDecisionSchema,
  governanceRequestSchema,
  officeCaseSchema,
  officeCaseUpdateSchema,
} from '@campushomes/shared';
import { AuthGuard } from '../auth/auth.guard';
import { PermissionedRequest, PermissionsGuard, RequirePermission } from '../auth/permissions';
import { rlsCtx } from '../auth/roles';
import { BusinessAccessService } from './business-access.service';
class CaseDto extends createZodDto(officeCaseSchema) {}
class CaseUpdateDto extends createZodDto(officeCaseUpdateSchema) {}
class RequestDto extends createZodDto(governanceRequestSchema) {}
class DecisionDto extends createZodDto(governanceDecisionSchema) {}

@Controller('admin')
@UseGuards(AuthGuard, PermissionsGuard)
export class BusinessAccessController {
  constructor(private readonly business: BusinessAccessService) {}
  private supervises(req: PermissionedRequest) {
    return req.session.access.roles.some((r) =>
      ['super_admin', 'platform_admin', 'general_manager'].includes(r),
    );
  }
  @Get('leadership') @RequirePermission('executive.read') overview(
    @Req() req: PermissionedRequest,
  ) {
    return this.business.overview(req.assignments);
  }
  @Get('governance') @RequirePermission('governance.request') governance(
    @Req() req: PermissionedRequest,
  ) {
    return this.business.governance(rlsCtx(req), req.permissions.has('governance.decide'));
  }
  @Post('governance') @RequirePermission('governance.request') request(
    @Req() req: PermissionedRequest,
    @Body() body: RequestDto,
  ) {
    return this.business.request(rlsCtx(req), body);
  }
  @Post('governance/:id/decision') @RequirePermission('governance.decide') decide(
    @Req() req: PermissionedRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: DecisionDto,
  ) {
    return this.business.decide(rlsCtx(req), id, body.decision, body.reason);
  }
  @Get('office') @RequirePermission('office.read') office(@Req() req: PermissionedRequest) {
    return this.business.office(rlsCtx(req), req.assignments, this.supervises(req));
  }
  @Post('office') @RequirePermission('office.manage') createCase(
    @Req() req: PermissionedRequest,
    @Body() body: CaseDto,
  ) {
    return this.business.createCase(rlsCtx(req), req.assignments, this.supervises(req), body);
  }
  @Patch('office/:id') @RequirePermission('office.manage') updateCase(
    @Req() req: PermissionedRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: CaseUpdateDto,
  ) {
    return this.business.updateCase(rlsCtx(req), req.assignments, this.supervises(req), id, body);
  }
}
