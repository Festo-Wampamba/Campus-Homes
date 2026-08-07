import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Query, Req, UseGuards } from '@nestjs/common';
import { createZodDto } from 'nestjs-zod';

import { createManualJournalEntrySchema } from '@campushomes/shared';

import { AuthGuard, type AuthenticatedRequest } from '../auth/auth.guard';
import { PermissionsGuard, RequirePermission } from '../auth/permissions';
import { rlsCtx } from '../auth/roles';
import { FinanceJournalService } from './finance-journal.service';

class CreateManualJournalEntryDto extends createZodDto(createManualJournalEntrySchema) {}

@Controller('admin/finance/journal-entries')
@UseGuards(AuthGuard, PermissionsGuard)
export class FinanceJournalController {
  constructor(private readonly journal: FinanceJournalService) {}

  @Get()
  @RequirePermission('finance.read')
  list(@Query('from') from?: string, @Query('to') to?: string, @Query('sourceType') sourceType?: string) {
    return this.journal.list(from, to, sourceType);
  }

  @Get(':id')
  @RequirePermission('finance.read')
  detail(@Param('id', ParseUUIDPipe) id: string) {
    return this.journal.detail(id);
  }

  @Post()
  @RequirePermission('finance.manage')
  create(@Req() req: AuthenticatedRequest, @Body() body: CreateManualJournalEntryDto) {
    return this.journal.create(rlsCtx(req), body);
  }
}
