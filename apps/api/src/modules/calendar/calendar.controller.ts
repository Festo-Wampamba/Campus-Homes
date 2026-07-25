import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';

import { AuthGuard, type AuthenticatedRequest } from '../auth/auth.guard';
import { rlsCtx } from '../auth/roles';
import { CalendarService } from './calendar.service';
import { CreateCalendarEventDto, UpdateCalendarEventDto } from './calendar.dto';

// Every role's personal task/reminder calendar — no @Roles restriction,
// AuthGuard alone is enough since RLS scopes rows to the caller regardless
// of which portal they're signed into.
@Controller('calendar')
@UseGuards(AuthGuard)
export class CalendarController {
  constructor(private readonly calendar: CalendarService) {}

  @Get()
  list(@Req() req: AuthenticatedRequest, @Query('from') from?: string, @Query('to') to?: string) {
    return this.calendar.list(rlsCtx(req), from, to);
  }

  @Post()
  create(@Req() req: AuthenticatedRequest, @Body() body: CreateCalendarEventDto) {
    return this.calendar.create(rlsCtx(req), body);
  }

  @Patch(':id')
  update(
    @Req() req: AuthenticatedRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: UpdateCalendarEventDto,
  ) {
    return this.calendar.update(rlsCtx(req), id, body);
  }

  @Delete(':id')
  remove(@Req() req: AuthenticatedRequest, @Param('id', ParseUUIDPipe) id: string) {
    return this.calendar.remove(rlsCtx(req), id);
  }
}
