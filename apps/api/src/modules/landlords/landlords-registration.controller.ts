import { Body, Controller, Post } from '@nestjs/common';
import { createZodDto } from 'nestjs-zod';

import { landlordSelfRegisterSchema } from '@campushomes/shared';

import { LandlordsService } from './landlords.service';

class LandlordSelfRegisterDto extends createZodDto(landlordSelfRegisterSchema) {}

// Public — no session exists yet. Deliberately a separate controller from
// LandlordsController (which is guarded at the class level) rather than an
// exempted route on it.
@Controller('landlords')
export class LandlordsRegistrationController {
  constructor(private readonly landlords: LandlordsService) {}

  @Post('register')
  register(@Body() body: LandlordSelfRegisterDto) {
    return this.landlords.register(body);
  }
}
