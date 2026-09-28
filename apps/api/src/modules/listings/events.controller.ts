import { Body, Controller, HttpCode, Post } from '@nestjs/common';
import { createZodDto } from 'nestjs-zod';

import { trackEventSchema } from '@campushomes/shared';

import { ListingsService } from './listings.service';

class TrackEventDto extends createZodDto(trackEventSchema) {}

// Public on purpose: page views happen before sign-in. Abuse is bounded by
// the write rate limit in main.ts and the schema's length caps.
@Controller('events')
export class EventsController {
  constructor(private readonly listings: ListingsService) {}

  @Post()
  @HttpCode(204)
  async track(@Body() dto: TrackEventDto) {
    await this.listings.recordEvent(dto);
  }
}
