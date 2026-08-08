import { Controller, Get } from '@nestjs/common';

@Controller()
export class RootController {
  @Get()
  status() {
    return {
      service: 'campushomes-api',
      status: 'online',
      health: '/api/v1/health',
    };
  }
}
