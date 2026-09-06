import { randomBytes, randomUUID } from 'node:crypto';
import { ConflictException, Controller, Get, Logger, Post, Query, Req, Res } from '@nestjs/common';
import { parse } from 'cookie';
import type { Request, Response } from 'express';
import type { Prompt } from '@logto/node';
import { safeAuthDestination } from '@campushomes/shared';
import { loadEnv } from '../../config/env';
import { readSessionCookie } from './auth.guard';
import { AuthTransactions, AUTH_TRANSACTION_TTL_SECONDS, transactionCookie } from './auth-transactions';
import { digest, matchesSecret, providerAssurance } from './auth-security';
import { LogtoClientFactory } from './logto-client.factory';
import { webOrigin, type Portal } from './logto.config';
import { ProvisioningService } from './provisioning.service';
import { SESSION_COOKIE_NAME, SessionStore } from './session.store';

const LEGACY_AUTH_COOKIES = ['campushomes-signin-session', 'campushomes-signin-portal', 'campushomes-signin-next'];

function clearLegacyCookies(res: Response, domain?: string) {
  for (const name of LEGACY_AUTH_COOKIES) {
    for (const path of ['/', '/api/auth/logto']) {
      res.clearCookie(name, { path });
      if (domain) res.clearCookie(name, { path, domain });
    }
  }
  if (domain) res.clearCookie(SESSION_COOKIE_NAME, { path: '/', domain });
}

function correlationId(res: Response): string {
  const id = randomUUID();
  res.setHeader('X-Request-Id', id);
  res.setHeader('Cache-Control', 'no-store');
  return id;
}

@Controller('api/auth/logto')
export class AuthController {
  private readonly logger = new Logger(AuthController.name);
  constructor(
    private readonly provisioning: ProvisioningService,
    private readonly sessionStore: SessionStore,
    private readonly transactions: AuthTransactions,
    private readonly clients: LogtoClientFactory,
  ) {}

  @Get('sign-in')
  async signIn(
    @Query('portal') portalParam: string | undefined,
    @Query('token') token: string | undefined,
    @Query('email') email: string | undefined,
    @Query('next') next: string | undefined,
    @Req() req: Request,
    @Res() res: Response,
  ) {
    const requestId = correlationId(res);
    const env = loadEnv();
    const portal: Portal = portalParam === 'staff' ? 'staff' : 'consumer';
    const state = randomBytes(32).toString('base64url');
    const browserSecret = randomBytes(32).toString('base64url');
    const nonce = randomBytes(32).toString('base64url');
    const startedAt = Date.now();
    const values: Record<string, string> = {};
    try {
      const existingToken = readSessionCookie(req);
      const existing = existingToken ? await this.sessionStore.find(existingToken) : null;
      const client = await this.clients.create(env, portal, values, async (url) => {
        await this.transactions.save(state, {
          portal, next: safeAuthDestination(next), nonce, startedAt,
          browserHash: digest(browserSecret), storage: values,
          expectedUserId: portal === 'staff' ? existing?.user.id ?? null : null,
        });
        clearLegacyCookies(res, env.AUTH_COOKIE_DOMAIN);
        res.cookie(transactionCookie(state), browserSecret, {
          httpOnly: true, secure: env.NODE_ENV === 'production', sameSite: 'lax',
          path: '/api/auth/logto/callback', maxAge: AUTH_TRANSACTION_TTL_SECONDS * 1000,
        });
        res.redirect(url);
      }, state);
      await client.signIn({
        redirectUri: `${webOrigin(env)}/api/auth/logto/callback`,
        ...(portal === 'staff' ? { prompt: 'login' as Prompt } : {}),
        extraParams: {
          nonce,
          ...(portal === 'staff' ? { max_age: '0', claims: JSON.stringify({ id_token: { auth_time: { essential: true }, amr: { essential: true } } }) } : {}),
          ...(token ? { one_time_token: token } : {}),
        },
        ...(token && email ? { loginHint: email } : {}),
      });
    } catch {
      this.logger.warn(JSON.stringify({ event: 'auth.start.unavailable', requestId }));
      res.status(503).json({ code: 'AUTH_UNAVAILABLE', message: 'Authentication temporarily unavailable', requestId });
    }
  }

  @Get('callback')
  async callback(@Req() req: Request, @Res() res: Response) {
    const requestId = correlationId(res);
    const env = loadEnv();
    const fail = (code: string) => res.redirect(`${webOrigin(env)}/sign-in?error=${code}&requestId=${requestId}`);
    const state = typeof req.query.state === 'string' ? req.query.state : '';
    if (!/^[A-Za-z0-9_-]{43}$/.test(state)) return fail('sign_in_expired');
    const cookie = transactionCookie(state);
    const browserSecret = parse(req.headers.cookie ?? '')[cookie];
    res.clearCookie(cookie, { path: '/api/auth/logto/callback' });
    if (!browserSecret) return fail('sign_in_expired');
    let transaction;
    try {
      transaction = await this.transactions.consume(state, browserSecret);
    } catch {
      this.logger.warn(JSON.stringify({ event: 'auth.transaction.unavailable', requestId }));
      return fail('auth_unavailable');
    }
    if (!transaction) return fail('sign_in_expired');
    try {
      const client = await this.clients.create(env, transaction.portal, transaction.storage, () => undefined);
      await client.handleSignInCallback(`${webOrigin(env)}${req.originalUrl}`);
      const claims = await client.getIdTokenClaims();
      // The SDK checks issuer/audience/signature/state/PKCE; this explicit
      // nonce check covers the binding absent from the installed SDK.
      if (typeof claims.nonce !== 'string' || !matchesSecret(claims.nonce, transaction.nonce)) return fail('sign_in_failed');
      const provisioned = await this.provisioning.provision({
        sub: claims.sub, email: claims.email, phoneNumber: claims.phone_number, name: claims.name,
        emailVerified: claims.email_verified === true, phoneVerified: claims.phone_number_verified === true,
      }, transaction.portal);
      if (!provisioned) return fail('not_invited');
      if (transaction.expectedUserId && provisioned.id !== transaction.expectedUserId) return fail('account_mismatch');
      if (provisioned.status !== 'active') return res.redirect(`${webOrigin(env)}/account-pending`);
      const assurance = providerAssurance(claims, transaction.startedAt, transaction.portal === 'staff', env.LOGTO_MFA_POLICY_VERIFIED);
      if (transaction.portal === 'staff' && !assurance.mfaVerified) return fail('mfa_required');
      const { token } = await this.sessionStore.create(provisioned.id, req.ip, req.headers['user-agent'], assurance);
      const oldToken = readSessionCookie(req);
      if (oldToken) await this.sessionStore.destroy(oldToken);
      clearLegacyCookies(res, env.AUTH_COOKIE_DOMAIN);
      res.cookie(SESSION_COOKIE_NAME, token, {
        httpOnly: true, secure: env.NODE_ENV === 'production', sameSite: 'lax', path: '/',
        maxAge: 7 * 24 * 60 * 60 * 1000,
      });
      this.logger.log(JSON.stringify({ event: 'auth.callback.success', requestId, portal: transaction.portal }));
      const next = transaction.next ? `?next=${encodeURIComponent(transaction.next)}` : '';
      return res.redirect(`${webOrigin(env)}/auth/callback${next}`);
    } catch (error) {
      if (error instanceof ConflictException) {
        this.logger.warn(JSON.stringify({ event: 'auth.callback.identity_conflict', requestId }));
        return fail('identity_conflict');
      }
      this.logger.warn(JSON.stringify({ event: 'auth.callback.failed', requestId }));
      return fail('sign_in_failed');
    }
  }

  @Post('sign-out')
  async signOut(@Req() req: Request, @Res() res: Response) {
    const requestId = correlationId(res);
    const env = loadEnv();
    const token = readSessionCookie(req);
    if (token) await this.sessionStore.destroy(token);
    res.clearCookie(SESSION_COOKIE_NAME, { path: '/' });
    clearLegacyCookies(res, env.AUTH_COOKIE_DOMAIN);
    for (const name of Object.keys(parse(req.headers.cookie ?? ''))) {
      if (/^campushomes-auth-[a-f0-9]{24}$/.test(name)) res.clearCookie(name, { path: '/api/auth/logto/callback' });
    }
    try {
      let redirectUrl = '';
      const client = await this.clients.create(env, 'consumer', {}, (url) => { redirectUrl = url; });
      await client.signOut(`${webOrigin(env)}/sign-in`);
      return res.json({ redirectUrl });
    } catch {
      this.logger.warn(JSON.stringify({ event: 'auth.logout.provider_unavailable', requestId }));
      return res.json({ redirectUrl: `${webOrigin(env)}/sign-in?error=sso_logout_failed` });
    }
  }
}

@Controller('api/auth')
export class SessionController {
  constructor(private readonly sessionStore: SessionStore) {}
  @Get('session')
  async session(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    correlationId(res);
    const token = readSessionCookie(req);
    return token ? await this.sessionStore.find(token) : null;
  }
}
