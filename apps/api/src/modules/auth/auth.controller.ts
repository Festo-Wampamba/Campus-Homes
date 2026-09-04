import { Controller, Get, Post, Query, Req, Res } from '@nestjs/common';
import { parse } from 'cookie';
import type { CookieOptions, Request, Response } from 'express';

// @logto/node ships ESM-only (no "require" export condition) — a static
// import compiles to require() under this project's commonjs module target
// (apps/api/tsconfig.json) and fails at runtime with ERR_PACKAGE_PATH_NOT_
// EXPORTED. A plain `import(...)` expression doesn't dodge this: with
// module: "commonjs", tsc itself downlevels dynamic import() to
// `Promise.resolve().then(() => require(...))`, hitting the exact same
// require()-based resolution and the exact same error — confirmed by
// inspecting dist/ output before landing this fix. The standard escape
// hatch is a Function-constructed import: the specifier is a runtime
// string tsc can't see, so it can't rewrite this into a require() call,
// and Node performs a genuine native ESM import that honors the package's
// "import" condition. Same root cause and same fix shape as the existing
// better-auth/crypto ESM interop workaround. Cached so the import only
// happens once per process, not per request.
const nativeImport = new Function('specifier', 'return import(specifier)') as (
  specifier: string,
) => Promise<typeof import('@logto/node')>;
let logtoNodeModule: Promise<typeof import('@logto/node')> | null = null;
function loadLogtoNode() {
  logtoNodeModule ??= nativeImport('@logto/node');
  return logtoNodeModule;
}

import { loadEnv } from '../../config/env';
import { readSessionCookie } from './auth.guard';
import { logtoConfigFor, webOrigin, type Portal } from './logto.config';
import { ProvisioningService } from './provisioning.service';
import { SESSION_COOKIE_NAME, SessionStore } from './session.store';

const SIGN_IN_SESSION_COOKIE = 'campushomes-signin-session';
// Short-lived, cleared on read — carries the post-sign-in destination
// across the redirect to Logto and back, since nothing else round-trips
// through an OIDC authorization request/response.
const NEXT_COOKIE = 'campushomes-signin-next';
// Which OIDC application started this flow. Logto redirects to the bare
// registered redirect_uri and does NOT round-trip custom query params, so a
// `?portal=` on the callback is always absent — it silently defaulted to
// 'consumer', and staff sign-in then exchanged a staff-issued code using the
// consumer client's credentials, which Logto rejects with "Grant request is
// invalid". The sign-in session cookie can't cover this: it stores
// redirectUri/state/codeVerifier, never which appId/appSecret to present.
const PORTAL_COOKIE = 'campushomes-signin-portal';

function isSafeNextPath(value: string | undefined): value is string {
  // Single leading slash only — never a scheme-relative or absolute URL, or
  // this would be an open redirect off the sign-in flow.
  return typeof value === 'string' && value.startsWith('/') && !value.startsWith('//');
}

function readCookie(req: Request, name: string): string | undefined {
  const header = req.headers.cookie;
  return header ? parse(header)[name] : undefined;
}

function isPortal(value: unknown): value is Portal {
  return value === 'consumer' || value === 'staff';
}

async function buildClient(env: ReturnType<typeof loadEnv>, portal: Portal, req: Request, res: Response) {
  if (!env.LOGTO_COOKIE_SECRET) {
    throw new Error('AuthModule requires LOGTO_COOKIE_SECRET');
  }
  const { default: LogtoClient, CookieStorage } = await loadLogtoNode();
  const storage = new CookieStorage({
    cookieKey: SIGN_IN_SESSION_COOKIE,
    encryptionKey: env.LOGTO_COOKIE_SECRET,
    isSecure: env.NODE_ENV === 'production',
    getCookie: (name) => readCookie(req, name),
    setCookie: (name, value, options) => {
      // @logto/node's CookieStorage sets maxAge in SECONDS (14 days =
      // 14*24*3600), matching the `cookie` package's serialize() convention.
      // Express's res.cookie() instead takes maxAge in MILLISECONDS, so
      // passing the SDK's options straight through made this cookie expire
      // in ~1,209,600ms (~20 minutes) instead of 14 days -- anyone whose
      // sign-in took longer than 20 minutes end-to-end lost their PKCE
      // session and hit "Sign-in session not found" on the callback.
      const cookieOptions = options as CookieOptions;
      res.cookie(name, value, {
        ...cookieOptions,
        ...(cookieOptions.maxAge != null ? { maxAge: cookieOptions.maxAge * 1000 } : {}),
      });
    },
  });
  // REQUIRED. CookieStorage starts with empty in-memory sessionData and only
  // populates it from the request's cookie inside init(); @logto/node's
  // LogtoClient does NOT call this for you, it just forwards the storage into
  // the adapter. Without it the callback's getSignInSession() always reads
  // null and every sign-in dies with `sign_in_session.not_found` — the
  // /sign-in leg still appears to work because it only ever WRITES the cookie.
  await storage.init();
  return new LogtoClient(logtoConfigFor(env, portal), {
    storage,
    navigate: (url) => res.redirect(url),
  });
}

@Controller('api/auth/logto')
export class AuthController {
  constructor(
    private readonly provisioning: ProvisioningService,
    private readonly sessionStore: SessionStore,
  ) {}

  /**
   * Initiates sign-in. `token`/`email`, when present, redeem a Management-
   * API-issued one-time-token magic link (staff/landlord invites — see
   * logto-management.client.ts) instead of a normal interactive sign-in.
   */
  @Get('sign-in')
  async signIn(
    @Query('portal') portalParam: string | undefined,
    @Query('token') token: string | undefined,
    @Query('email') email: string | undefined,
    @Query('next') next: string | undefined,
    @Req() req: Request,
    @Res() res: Response,
  ) {
    const portal = isPortal(portalParam) ? portalParam : 'consumer';
    const env = loadEnv();
    res.cookie(PORTAL_COOKIE, portal, {
      httpOnly: true,
      secure: env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/api/auth/logto',
      maxAge: 10 * 60 * 1000,
    });
    if (isSafeNextPath(next)) {
      res.cookie(NEXT_COOKIE, next, {
        httpOnly: true,
        secure: env.NODE_ENV === 'production',
        sameSite: 'lax',
        path: '/api/auth/logto',
        maxAge: 10 * 60 * 1000,
      });
    }
    const client = await buildClient(env, portal, req, res);
    const redirectUri = `${webOrigin(env)}/api/auth/logto/callback`;
    await client.signIn({
      redirectUri,
      ...(token ? { extraParams: { one_time_token: token }, ...(email ? { loginHint: email } : {}) } : {}),
    });
  }

  @Get('callback')
  async callback(@Query('portal') portalParam: string | undefined, @Req() req: Request, @Res() res: Response) {
    // Both OIDC apps share this one callback URI, so the client must be
    // rebuilt with the SAME appId/appSecret the flow started with — the token
    // exchange authenticates with them. Logto strips custom query params from
    // the redirect, so `?portal=` never arrives here; read the cookie
    // /sign-in set instead and only fall back to the query param (then
    // consumer) so an in-flight pre-deploy sign-in still resolves.
    const rawPortal = readCookie(req, PORTAL_COOKIE) ?? portalParam;
    const portal = isPortal(rawPortal) ? rawPortal : 'consumer';
    const env = loadEnv();
    res.clearCookie(PORTAL_COOKIE, { path: '/api/auth/logto' });
    const client = await buildClient(env, portal, req, res);

    let provisioned;
    try {
      const callbackUrl = `${webOrigin(env)}${req.originalUrl}`;
      await client.handleSignInCallback(callbackUrl);
      const claims = await client.getIdTokenClaims();
      provisioned = await this.provisioning.provision(
        { sub: claims.sub, email: claims.email, phoneNumber: claims.phone_number, name: claims.name },
        portal,
      );
    } catch (err) {
      console.error('Logto callback failed', err);
      res.redirect(`${webOrigin(env)}/sign-in?error=sign_in_failed`);
      return;
    }
    if (!provisioned) {
      res.redirect(`${webOrigin(env)}/sign-in?error=not_invited`);
      return;
    }

    const { token } = await this.sessionStore.create(provisioned.id, req.ip, req.headers['user-agent']);
    res.cookie(SESSION_COOKIE_NAME, token, {
      httpOnly: true,
      secure: env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      ...(env.AUTH_COOKIE_DOMAIN ? { domain: env.AUTH_COOKIE_DOMAIN } : {}),
      maxAge: 60 * 60 * 24 * 7 * 1000,
    });

    const rawNext = readCookie(req, NEXT_COOKIE);
    res.clearCookie(NEXT_COOKIE, { path: '/api/auth/logto' });
    const next = isSafeNextPath(rawNext) ? rawNext : undefined;
    const callbackPage = next ? `/auth/callback?next=${encodeURIComponent(next)}` : '/auth/callback';
    res.redirect(`${webOrigin(env)}${callbackPage}`);
  }

  @Post('sign-out')
  async signOut(@Req() req: Request, @Res() res: Response) {
    const token = readSessionCookie(req);
    if (token) await this.sessionStore.destroy(token);
    res.clearCookie(SESSION_COOKIE_NAME, { path: '/' });
    res.status(204).send();
  }
}

@Controller('api/auth')
export class SessionController {
  constructor(private readonly sessionStore: SessionStore) {}

  /** Replaces Better Auth's /api/auth/get-session — read by
   * apps/web/src/lib/session.ts's getServerSession(). Returns null, not an
   * error, when unauthenticated: this endpoint answers "who is this,
   * if anyone", it doesn't gate access. */
  @Get('session')
  async session(@Req() req: Request) {
    const token = readSessionCookie(req);
    return token ? await this.sessionStore.find(token) : null;
  }
}
