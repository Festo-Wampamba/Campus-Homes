import { Body, Controller, Post } from '@nestjs/common';

import { CreateOnboardingLeadDto } from './leads.dto';
import { LeadsService } from './leads.service';

// Deliberately no AuthGuard — a prospective landlord filling this out from
// the public /landlords page has no account yet.
@Controller('leads')
export class LeadsController {
  constructor(private readonly leads: LeadsService) {}

  @Post()
  create(@Body() body: CreateOnboardingLeadDto) {
    return this.leads.create(body);
  }
}
