import { Body, Controller, Get, Post, Req, UseGuards } from '@nestjs/common';
import { createZodDto } from 'nestjs-zod';
import { eq } from 'drizzle-orm';

import { createStudentProfileSchema } from '@campushomes/shared';

import { RlsDb } from '../../db/db.module';
import { students } from '../../db/schema';
import { AuthGuard, type AuthenticatedRequest } from '../auth/auth.guard';
import { Roles, RolesGuard, rlsCtx } from '../auth/roles';

class CreateStudentProfileDto extends createZodDto(createStudentProfileSchema) {}

/**
 * Completes the domain profile a phone-OTP signup doesn't collect (brief §7:
 * `students`/`landlords` are role-specific profiles, not parallel auth
 * roots). Reservations FK to `students.user_id` — without this, a signed-up
 * student can never hold a unit.
 */
@Controller('students')
@UseGuards(AuthGuard, RolesGuard)
export class ProfileController {
  constructor(private readonly rlsDb: RlsDb) {}

  @Get('me')
  @Roles('student')
  me(@Req() req: AuthenticatedRequest) {
    const ctx = rlsCtx(req);
    return this.rlsDb.run(ctx, async (db) => {
      const [row] = await db.select().from(students).where(eq(students.userId, ctx.userId));
      return row ?? null;
    });
  }

  @Post('profile')
  @Roles('student')
  createProfile(@Req() req: AuthenticatedRequest, @Body() body: CreateStudentProfileDto) {
    const ctx = rlsCtx(req);
    // RLS (students_self_insert) independently requires user_id = caller AND
    // role = student — this just satisfies the NOT NULL/PK shape.
    return this.rlsDb.run(ctx, async (db) => {
      const [row] = await db
        .insert(students)
        .values({ userId: ctx.userId, university: body.university, yearOfStudy: body.yearOfStudy })
        .onConflictDoNothing()
        .returning();
      return row ?? { alreadyExists: true };
    });
  }
}
