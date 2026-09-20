import { createHash, randomInt } from 'node:crypto';

import {
  BadRequestException,
  Body,
  ConflictException,
  Controller,
  ForbiddenException,
  Get,
  Patch,
  Post,
  Req,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { createZodDto } from 'nestjs-zod';
import { eq } from 'drizzle-orm';

import { changeSelfEmailSchema, confirmSelfEmailSchema, changeSelfPasswordSchema, profileOnboardingSchema, updateSelfParticularsSchema } from '@campushomes/shared';

import { loadEnv } from '../../config/env';
import { RlsDb } from '../../db/db.module';
import type { RlsContext } from '../../db/rls-context';
import { users } from '../../db/schema';
import { sendVerificationCodeEmail } from '../auth/auth.email';
import { AuthGuard, type AuthenticatedRequest } from '../auth/auth.guard';
import { LogtoEmailConflictError, LogtoManagementClient } from '../auth/logto-management.client';
import { rlsCtx } from '../auth/roles';
import { updateSelfParticulars } from './particulars';

class UpdateSelfParticularsDto extends createZodDto(updateSelfParticularsSchema) {}
class ChangeSelfEmailDto extends createZodDto(changeSelfEmailSchema) {}
class ConfirmSelfEmailDto extends createZodDto(confirmSelfEmailSchema) {}
class ChangeSelfPasswordDto extends createZodDto(changeSelfPasswordSchema) {}
class ProfileOnboardingDto extends createZodDto(profileOnboardingSchema) {}

// Keep in sync with the `interval '15 minutes'` in the INSERT below.
const EMAIL_CODE_MAX_ATTEMPTS = 5;

function hashCode(code: string): string {
  return createHash('sha256').update(code).digest('hex');
}

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
          username: users.username,
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
   * First-sign-in identity gate: set full name + a unique @handle. Runs as
   * service_role because `users` has no self-UPDATE RLS policy (role/status
   * escalation risk) — the field allowlist here (name/username only) is what
   * keeps it safe. Applies to every account, including Google sign-ins that
   * arrive without a chosen username.
   */
  @Post('onboarding')
  async completeOnboarding(@Req() req: AuthenticatedRequest, @Body() body: ProfileOnboardingDto) {
    const ctx = rlsCtx(req);
    const svcCtx: RlsContext = { userId: ctx.userId, role: 'service_role' };
    const username = body.username.toLowerCase();
    return this.rlsDb.run(svcCtx, async (db) => {
      try {
        const [row] = await db
          .update(users)
          .set({ name: body.name.trim(), username, updatedAt: new Date() })
          .where(eq(users.id, ctx.userId))
          .returning({ id: users.id, name: users.name, username: users.username });
        return row;
      } catch (err) {
        // 23505 = users_username_lower_uk violation (handle already taken).
        if ((err as { cause?: { code?: string } }).cause?.code === '23505') {
          throw new ConflictException('That username is already taken');
        }
        throw err;
      }
    });
  }

  /**
   * Step 1 of a sign-in email change: mail a 6-digit code to the NEW address.
   * The change is only applied once the caller returns that code to
   * PATCH /me/email, proving they own the address. This ownership proof is
   * what makes it safe to later PATCH Logto's primaryEmail — a management
   * PATCH is trusted by Logto, and provisioning consumes staff invitations by
   * the Logto verified-email claim, so pushing an unproven email to Logto
   * would let a user claim a pending invite's email and its role.
   */
  @Post('email/code')
  async requestEmailChange(@Req() req: AuthenticatedRequest, @Body() body: ChangeSelfEmailDto) {
    assertFreshSignIn(req, 'Changing your sign-in email');
    const ctx = rlsCtx(req);
    const svcCtx: RlsContext = { userId: ctx.userId, role: 'service_role' };
    const email = body.email.trim().toLowerCase();

    const code = randomInt(0, 1_000_000).toString().padStart(6, '0');
    await this.rlsDb.run(svcCtx, async (_db, client) => {
      const [current] = (await client.query<{ email: string | null }>(
        'SELECT email FROM users WHERE id = $1', [ctx.userId])).rows;
      if (current?.email && current.email.toLowerCase() === email) {
        throw new BadRequestException('That is already your email address');
      }
      const taken = (await client.query(
        'SELECT 1 FROM users WHERE lower(btrim(email)) = $1 AND id <> $2 AND deleted_at IS NULL',
        [email, ctx.userId])).rowCount;
      if (taken) throw new ConflictException('That email is already in use by another account');
      // One live challenge per user — a new request supersedes the old.
      await client.query('DELETE FROM email_change_requests WHERE user_id = $1 AND consumed_at IS NULL', [ctx.userId]);
      await client.query(
        `INSERT INTO email_change_requests (user_id, new_email, code_hash, expires_at)
         VALUES ($1, $2, $3, now() + interval '15 minutes')`,
        [ctx.userId, email, hashCode(code)]);
    });
    // Deliver outside the transaction; a failed send just means the user
    // requests another code (which replaces this row).
    await sendVerificationCodeEmail(loadEnv(), { to: email, code, kind: 'generic' });
    return { sent: true };
  }

  /** Step 2: verify the emailed code, then apply the change at Logto (the
   * sign-in source of truth) and locally. */
  @Patch('email')
  async confirmEmailChange(@Req() req: AuthenticatedRequest, @Body() body: ConfirmSelfEmailDto) {
    assertFreshSignIn(req, 'Changing your sign-in email');
    const ctx = rlsCtx(req);
    const svcCtx: RlsContext = { userId: ctx.userId, role: 'service_role' };
    const email = body.email.trim().toLowerCase();

    // Validate the code and read the identity in one short transaction, then
    // release it before the Logto network call (never hold a tx open across
    // a network round-trip). A wrong-code attempt must COMMIT its increment,
    // so it returns a sentinel instead of throwing (a throw would roll the
    // counter back and defeat the brute-force limit).
    const outcome = await this.rlsDb.run(svcCtx, async (_db, client) => {
      const [row] = (await client.query<{ id: string; codeHash: string; attempts: number; expired: boolean }>(
        `SELECT id, code_hash AS "codeHash", attempts, expires_at <= now() AS expired
         FROM email_change_requests
         WHERE user_id = $1 AND new_email = $2 AND consumed_at IS NULL
         ORDER BY created_at DESC LIMIT 1 FOR UPDATE`,
        [ctx.userId, email])).rows;
      if (!row) throw new BadRequestException('Request a verification code first');
      if (row.expired) throw new BadRequestException('That code has expired — request a new one');
      if (row.attempts >= EMAIL_CODE_MAX_ATTEMPTS) {
        throw new BadRequestException('Too many attempts — request a new code');
      }
      if (row.codeHash !== hashCode(body.code)) {
        await client.query('UPDATE email_change_requests SET attempts = attempts + 1 WHERE id = $1', [row.id]);
        return { ok: false as const };
      }
      const [user] = (await client.query<{ logtoUserId: string | null }>(
        'SELECT logto_user_id AS "logtoUserId" FROM users WHERE id = $1', [ctx.userId])).rows;
      if (!user?.logtoUserId) throw new ForbiddenException('This account is not linked to a sign-in identity');
      return { ok: true as const, requestId: row.id, logtoUserId: user.logtoUserId };
    });
    if (!outcome.ok) throw new UnauthorizedException('Incorrect verification code');
    const { requestId, logtoUserId } = outcome;

    try {
      await this.logtoManagement.updatePrimaryEmail(logtoUserId, email);
    } catch (err) {
      if (err instanceof LogtoEmailConflictError) throw new ConflictException(err.message);
      throw err;
    }

    return this.rlsDb.run(svcCtx, async (db, client) => {
      await client.query(
        'UPDATE email_change_requests SET consumed_at = now() WHERE id = $1 AND consumed_at IS NULL',
        [requestId]);
      try {
        const [updated] = await db
          .update(users)
          // Ownership is proven and Logto now holds this as its primary email.
          .set({ email, emailVerified: true, updatedAt: new Date() })
          .where(eq(users.id, ctx.userId))
          .returning({ id: users.id, email: users.email });
        return updated;
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
