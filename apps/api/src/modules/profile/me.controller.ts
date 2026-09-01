import {
  Body,
  ConflictException,
  Controller,
  ForbiddenException,
  Get,
  Patch,
  Req,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { createZodDto } from 'nestjs-zod';
import { eq } from 'drizzle-orm';

import { changeSelfEmailSchema, changeSelfPasswordSchema, updateSelfParticularsSchema } from '@campushomes/shared';

import { RlsDb } from '../../db/db.module';
import type { RlsContext } from '../../db/rls-context';
import { users } from '../../db/schema';
import { AuthGuard, type AuthenticatedRequest } from '../auth/auth.guard';
import { LogtoManagementClient } from '../auth/logto-management.client';
import { rlsCtx } from '../auth/roles';
import { updateSelfParticulars } from './particulars';

class UpdateSelfParticularsDto extends createZodDto(updateSelfParticularsSchema) {}
class ChangeSelfEmailDto extends createZodDto(changeSelfEmailSchema) {}
class ChangeSelfPasswordDto extends createZodDto(changeSelfPasswordSchema) {}

/** Same 30-minute step-up-freshness boundary PermissionsGuard enforces for
 * sensitive RBAC actions — no local password hash exists post-Logto to
 * re-verify against, so a recent sign-in is the substitute check: a
 * hijacked long-lived session alone can't swap the sign-in identity or
 * credential, since it would also have to be recent. */
function assertFreshSignIn(req: AuthenticatedRequest, action: string): void {
  const signedInAt = new Date(req.session.session.createdAt).getTime();
  if (!Number.isFinite(signedInAt) || Date.now() - signedInAt > 30 * 60_000) {
    throw new UnauthorizedException(`${action} requires a fresh sign-in`);
  }
}

/**
 * Role-agnostic "my account" particulars — the student and landlord portals
 * already expose this via their own role-gated routes; admin/ops staff had no
 * path at all. No @Roles(): users_read RLS covers self-reads for every role,
 * and updateSelfParticulars' field allowlist (never role/status/email/phone)
 * is what makes the write safe regardless of who calls it.
 */
@Controller('me')
@UseGuards(AuthGuard)
export class MeController {
  constructor(
    private readonly rlsDb: RlsDb,
    private readonly logtoManagement: LogtoManagementClient,
  ) {}

  @Get('particulars')
  particulars(@Req() req: AuthenticatedRequest) {
    const ctx = rlsCtx(req);
    return this.rlsDb.run(ctx, async (db) => {
      const [row] = await db
        .select({
          name: users.name,
          email: users.email,
          phone: users.phone,
          dateOfBirth: users.dateOfBirth,
          gender: users.gender,
          nationality: users.nationality,
          address: users.address,
          emergencyContactName: users.emergencyContactName,
          emergencyContactPhone: users.emergencyContactPhone,
        })
        .from(users)
        .where(eq(users.id, ctx.userId));
      return row ?? null;
    });
  }

  @Patch('particulars')
  updateParticulars(@Req() req: AuthenticatedRequest, @Body() body: UpdateSelfParticularsDto) {
    return updateSelfParticulars(this.rlsDb, rlsCtx(req), body);
  }

  @Patch('email')
  async changeEmail(@Req() req: AuthenticatedRequest, @Body() body: ChangeSelfEmailDto) {
    assertFreshSignIn(req, 'Changing your sign-in email');
    const ctx = rlsCtx(req);
    const svcCtx: RlsContext = { userId: ctx.userId, role: 'service_role' };
    return this.rlsDb.run(svcCtx, async (db) => {
      try {
        const [row] = await db
          .update(users)
          .set({ email: body.email, emailVerified: false, updatedAt: new Date() })
          .where(eq(users.id, ctx.userId))
          .returning({ id: users.id, email: users.email });
        return row;
      } catch (err) {
        // Drizzle wraps pg errors — 23505 = users.email unique violation.
        if ((err as { cause?: { code?: string } }).cause?.code === '23505') {
          throw new ConflictException('That email is already in use by another account');
        }
        throw err;
      }
    });
  }

  @Patch('password')
  async changePassword(@Req() req: AuthenticatedRequest, @Body() body: ChangeSelfPasswordDto) {
    assertFreshSignIn(req, 'Changing your password');
    const ctx = rlsCtx(req);
    const svcCtx: RlsContext = { userId: ctx.userId, role: 'service_role' };
    const [row] = await this.rlsDb.run(svcCtx, (db) =>
      db.select({ logtoUserId: users.logtoUserId, email: users.email }).from(users).where(eq(users.id, ctx.userId)),
    );
    // Password sign-in is email-identified in Logto — a phone-only identity
    // has no email/password credential to set one on.
    if (!row?.logtoUserId || !row.email) {
      throw new ForbiddenException('This account signs in with phone OTP, not email and password');
    }
    await this.logtoManagement.setPassword(row.logtoUserId, body.newPassword);
    return { changed: true };
  }
}
