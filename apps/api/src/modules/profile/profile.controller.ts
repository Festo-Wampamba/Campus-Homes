import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { createZodDto } from 'nestjs-zod';
import { and, eq } from 'drizzle-orm';

import { createStudentProfileSchema, saveListingSchema } from '@campushomes/shared';

import { RlsDb } from '../../db/db.module';
import { savedListings, students } from '../../db/schema';
import { AuthGuard, type AuthenticatedRequest } from '../auth/auth.guard';
import { Roles, RolesGuard, rlsCtx } from '../auth/roles';
import { ListingsService } from '../listings/listings.service';

class CreateStudentProfileDto extends createZodDto(createStudentProfileSchema) {}
class SaveListingDto extends createZodDto(saveListingSchema) {}

/**
 * Completes the domain profile a phone-OTP signup doesn't collect (brief §7:
 * `students`/`landlords` are role-specific profiles, not parallel auth
 * roots). Reservations FK to `students.user_id` — without this, a signed-up
 * student can never hold a unit.
 */
@Controller('students')
@UseGuards(AuthGuard, RolesGuard)
export class ProfileController {
  constructor(
    private readonly rlsDb: RlsDb,
    private readonly listings: ListingsService,
  ) {}

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

  @Get('saved-listings')
  @Roles('student')
  savedListings(@Req() req: AuthenticatedRequest) {
    return this.listings.savedByStudent(rlsCtx(req).userId);
  }

  @Post('saved-listings')
  @Roles('student')
  saveListing(@Req() req: AuthenticatedRequest, @Body() body: SaveListingDto) {
    const ctx = rlsCtx(req);
    // RLS (saved_listings_self) independently requires student_id = caller —
    // onConflictDoNothing makes re-saving an already-saved listing a no-op
    // rather than a duplicate-key error.
    return this.rlsDb.run(ctx, async (db) => {
      await db
        .insert(savedListings)
        .values({ studentId: ctx.userId, listingId: body.listingId })
        .onConflictDoNothing();
      return { saved: true };
    });
  }

  @Delete('saved-listings/:listingId')
  @Roles('student')
  async unsaveListing(
    @Req() req: AuthenticatedRequest,
    @Param('listingId', ParseUUIDPipe) listingId: string,
  ) {
    const ctx = rlsCtx(req);
    await this.rlsDb.run(ctx, (db) =>
      db
        .delete(savedListings)
        .where(and(eq(savedListings.studentId, ctx.userId), eq(savedListings.listingId, listingId))),
    );
    return { saved: false };
  }
}
