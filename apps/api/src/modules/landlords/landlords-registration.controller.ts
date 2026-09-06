import { Controller, GoneException, Post } from '@nestjs/common';

// Public — no session exists yet. Deliberately a separate controller from
// LandlordsController (which is guarded at the class level) rather than an
// exempted route on it.
@Controller('landlords')
export class LandlordsRegistrationController {
  @Post('register')
  register() {
    throw new GoneException({
      code: 'LANDLORD_REGISTRATION_MOVED',
      message: 'Sign in with Logto, then enroll the authenticated account as a landlord.',
      enrollmentPath: '/landlords/enroll',
    });
  }
}
