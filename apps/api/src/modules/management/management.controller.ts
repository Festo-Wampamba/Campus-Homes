import {
  Body,
  Controller,
  Delete,
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
  agencyMemberSchema,
  assignManagerSchema,
  createAgencySchema,
  createMandateSchema,
  managedPropertyUpdateSchema,
  managementNoteSchema,
  managementNoteUpdateSchema,
  mandateDecisionSchema,
} from '@campushomes/shared';
import { AuthGuard, type AuthenticatedRequest } from '../auth/auth.guard';
import { rlsCtx, Roles, RolesGuard } from '../auth/roles';
import { ManagementService } from './management.service';
class AgencyDto extends createZodDto(createAgencySchema) {}
class MemberDto extends createZodDto(agencyMemberSchema) {}
class MandateDto extends createZodDto(createMandateSchema) {}
class DecisionDto extends createZodDto(mandateDecisionSchema) {}
class AssignmentDto extends createZodDto(assignManagerSchema) {}
class PropertyDto extends createZodDto(managedPropertyUpdateSchema) {}
class NoteDto extends createZodDto(managementNoteSchema) {}
class NoteUpdateDto extends createZodDto(managementNoteUpdateSchema) {}

@Controller('management')
@UseGuards(AuthGuard)
export class ManagementController {
  constructor(private readonly management: ManagementService) {}
  @Get() dashboard(@Req() req: AuthenticatedRequest) {
    return this.management.dashboard(rlsCtx(req));
  }
  @Post('enroll') enroll(@Req() req: AuthenticatedRequest) {
    return this.management.enroll(rlsCtx(req));
  }
  @Post('agencies') agency(@Req() req: AuthenticatedRequest, @Body() body: AgencyDto) {
    return this.management.createAgency(rlsCtx(req), body.name);
  }
  @Get('agencies/:id/members') members(
    @Req() req: AuthenticatedRequest,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.management.agencyMembers(rlsCtx(req), id);
  }
  @Post('agencies/:id/members') addMember(
    @Req() req: AuthenticatedRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: MemberDto,
  ) {
    return this.management.addMember(rlsCtx(req), id, body.email);
  }
  @Delete('agencies/:id/members/:memberId') removeMember(
    @Req() req: AuthenticatedRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('memberId', ParseUUIDPipe) memberId: string,
  ) {
    return this.management.removeMember(rlsCtx(req), id, memberId);
  }
  @Get('notices') notices(@Req() req: AuthenticatedRequest) {
    return this.management.notices(rlsCtx(req));
  }
  @Get('owner') @UseGuards(RolesGuard) @Roles('landlord') owner(@Req() req: AuthenticatedRequest) {
    return this.management.ownerDashboard(rlsCtx(req));
  }
  @Post('mandates') @UseGuards(RolesGuard) @Roles('landlord') mandate(
    @Req() req: AuthenticatedRequest,
    @Body() body: MandateDto,
  ) {
    return this.management.createMandate(rlsCtx(req), body);
  }
  @Post('mandates/:id/decision') decision(
    @Req() req: AuthenticatedRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: DecisionDto,
  ) {
    return this.management.decideMandate(rlsCtx(req), id, body.decision);
  }
  @Delete('mandates/:id') @UseGuards(RolesGuard) @Roles('landlord') revoke(
    @Req() req: AuthenticatedRequest,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.management.revokeMandate(rlsCtx(req), id);
  }
  @Post('mandates/:id/assignments') assign(
    @Req() req: AuthenticatedRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: AssignmentDto,
  ) {
    return this.management.assign(rlsCtx(req), id, body.userId, body.capabilities);
  }
  @Delete('assignments/:id') unassign(
    @Req() req: AuthenticatedRequest,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.management.revokeAssignment(rlsCtx(req), id);
  }
  @Get('properties/:id') property(
    @Req() req: AuthenticatedRequest,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.management.property(rlsCtx(req), id);
  }
  @Get('properties/:id/team') team(
    @Req() req: AuthenticatedRequest,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.management.team(rlsCtx(req), id);
  }
  @Patch('properties/:id') edit(
    @Req() req: AuthenticatedRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: PropertyDto,
  ) {
    return this.management.updateProperty(rlsCtx(req), id, body);
  }
  @Post('properties/:id/notes') note(
    @Req() req: AuthenticatedRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: NoteDto,
  ) {
    return this.management.addNote(rlsCtx(req), id, body);
  }
  @Patch('notes/:id') updateNote(
    @Req() req: AuthenticatedRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: NoteUpdateDto,
  ) {
    return this.management.updateNote(rlsCtx(req), id, body.status);
  }
}
