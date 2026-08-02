import { BadRequestException, Controller, Get, Query, UseGuards } from '@nestjs/common';

import { AuthGuard } from '../auth/auth.guard';
import { PermissionsGuard, RequirePermission } from '../auth/permissions';
import { FinanceReportsService } from './finance-reports.service';

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

function requireDate(value: string | undefined, param: string): string {
  if (!value || !ISO_DATE.test(value)) {
    throw new BadRequestException(`${param} must be an ISO date (YYYY-MM-DD)`);
  }
  return value;
}

@Controller('admin/finance/reports')
@UseGuards(AuthGuard, PermissionsGuard)
export class FinanceReportsController {
  constructor(private readonly reports: FinanceReportsService) {}

  @Get('profit-loss')
  @RequirePermission('finance.read')
  profitLoss(@Query('from') from?: string, @Query('to') to?: string) {
    return this.reports.profitLoss(requireDate(from, 'from'), requireDate(to, 'to'));
  }

  @Get('balance-sheet')
  @RequirePermission('finance.read')
  balanceSheet(@Query('asOf') asOf?: string) {
    return this.reports.balanceSheet(requireDate(asOf, 'asOf'));
  }

  @Get('revenue-series')
  @RequirePermission('finance.read')
  revenueSeries(@Query('from') from?: string, @Query('to') to?: string) {
    return this.reports.revenueSeries(requireDate(from, 'from'), requireDate(to, 'to'));
  }
}
