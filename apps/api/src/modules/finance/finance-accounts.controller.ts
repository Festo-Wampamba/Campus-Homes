import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, UseGuards } from '@nestjs/common';
import { createZodDto } from 'nestjs-zod';

import { createLedgerAccountSchema, updateLedgerAccountSchema } from '@campushomes/shared';

import { AuthGuard } from '../auth/auth.guard';
import { PermissionsGuard, RequirePermission } from '../auth/permissions';
import { FinanceAccountsService } from './finance-accounts.service';

class CreateLedgerAccountDto extends createZodDto(createLedgerAccountSchema) {}
class UpdateLedgerAccountDto extends createZodDto(updateLedgerAccountSchema) {}

@Controller('admin/finance/accounts')
@UseGuards(AuthGuard, PermissionsGuard)
export class FinanceAccountsController {
  constructor(private readonly accounts: FinanceAccountsService) {}

  @Get()
  @RequirePermission('finance.read')
  list() {
    return this.accounts.list();
  }

  @Post()
  @RequirePermission('finance.manage')
  create(@Body() body: CreateLedgerAccountDto) {
    return this.accounts.create(body);
  }

  @Patch(':id')
  @RequirePermission('finance.manage')
  update(@Param('id', ParseUUIDPipe) id: string, @Body() body: UpdateLedgerAccountDto) {
    return this.accounts.update(id, body);
  }
}
