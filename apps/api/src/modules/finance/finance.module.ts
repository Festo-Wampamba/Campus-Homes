import { Module } from '@nestjs/common';

import { AuthModule } from '../auth/auth.module';
import { FinanceAccountsController } from './finance-accounts.controller';
import { FinanceAccountsService } from './finance-accounts.service';
import { FinanceJournalController } from './finance-journal.controller';
import { FinanceJournalService } from './finance-journal.service';
import { FinanceReportsController } from './finance-reports.controller';
import { FinanceReportsService } from './finance-reports.service';
import { LedgerService } from './ledger.service';

@Module({
  imports: [AuthModule],
  controllers: [FinanceAccountsController, FinanceJournalController, FinanceReportsController],
  providers: [LedgerService, FinanceAccountsService, FinanceJournalService, FinanceReportsService],
  // LedgerService is consumed by ReservationsService for auto-posting hold
  // fee revenue and refunds atomically alongside the payment/refund row.
  exports: [LedgerService],
})
export class FinanceModule {}
