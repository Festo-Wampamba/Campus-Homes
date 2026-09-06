import type { NextFunction, Request, Response } from 'express';
import { parse } from 'cookie';

/** CORS is not CSRF protection: sibling subdomains are same-site, not same-origin. */
export function cookieOriginGuard(webOrigin: string) {
  const allowedOrigin = new URL(webOrigin).origin;
  return (req: Request, res: Response, next: NextFunction) => {
    if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();
    const cookies = parse(req.headers.cookie ?? '');
    const hasSession = Object.keys(cookies).some((key) => key.startsWith('campushomes-session') || key.startsWith('campushomes-auth'));
    if (!hasSession) return next();
    if (req.headers.origin !== allowedOrigin || req.headers['sec-fetch-site'] === 'cross-site') {
      return res.status(403).json({ statusCode: 403, code: 'ORIGIN_NOT_ALLOWED', message: 'Request origin is not allowed' });
    }
    return next();
  };
}
