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
import { verifyPassword } from 'better-auth/crypto';
import { and, eq } from 'drizzle-orm';

import { changeSelfEmailSchema, updateSelfParticularsSchema } from '@campushomes/shared';

import { RlsDb } from '../../db/db.module';
import type { RlsContext } from '../../db/rls-context';
import { accounts, users } from '../../db/schema';
import { AuthGuard, type AuthenticatedRequest } from '../auth/auth.guard';
import { rlsCtx } from '../auth/roles';
import { updateSelfParticulars } from './particulars';

class UpdateSelfParticularsDto extends createZodDto(updateSelfParticularsSchema) {}
class ChangeSelfEmailDto extends createZodDto(changeSelfEmailSchema) {}

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
  constructor(private readonly rlsDb: RlsDb) {}

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

  /**
   * Sign-in email change for staff credential accounts. Re-verifies the
   * current password against the stored Better Auth hash — a hijacked
   * session alone must never be able to swap the sign-in identity. Password
   * changes themselves go through Better Auth's own /api/auth/change-password
   * (which enforces the same current-password check); only the email swap
   * needs this custom path, because Better Auth's changeEmail on a verified
   * email requires an email-verification send and no email delivery exists.
   */
  @Patch('email')
  async changeEmail(@Req() req: AuthenticatedRequest, @Body() body: ChangeSelfEmailDto) {
    const ctx = rlsCtx(req);
    const svcCtx: RlsContext = { userId: ctx.userId, role: 'service_role' };
    return this.rlsDb.run(svcCtx, async (db) => {
      // accounts is svc_all-only under RLS (0002) — hash never leaves here.
      const [account] = await db
        .select({ password: accounts.password })
        .from(accounts)
        .where(and(eq(accounts.userId, ctx.userId), eq(accounts.providerId, 'credential')));
      if (!account?.password) {
        throw new ForbiddenException('This account signs in with phone OTP, not email and password');
      }
      const valid = await verifyPassword({ hash: account.password, password: body.currentPassword });
      if (!valid) {
        throw new UnauthorizedException('Current password is incorrect');
      }
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
}
