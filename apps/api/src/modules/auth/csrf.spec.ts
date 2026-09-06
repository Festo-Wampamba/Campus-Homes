import type { Request, Response } from 'express';
import { cookieOriginGuard } from './csrf';

describe('cookie-authenticated request origins', () => {
  function check(method: string, headers: Record<string, string>) {
    const next = jest.fn();
    const json = jest.fn();
    const status = jest.fn().mockReturnValue({ json });
    cookieOriginGuard('https://staging.example.invalid')({ method, headers } as Request, { status } as unknown as Response, next);
    return { next, status };
  }
  const cookie = 'campushomes-session-v1=synthetic';
  it.each(['https://evil.invalid', 'https://other.example.invalid', 'null', ''])('denies cookie writes from %s', (origin) => {
    expect(check('POST', { cookie, origin }).status).toHaveBeenCalledWith(403);
  });
  it('allows same-origin writes', () => {
    expect(check('POST', { cookie, origin: 'https://staging.example.invalid' }).next).toHaveBeenCalled();
  });
  it('does not interfere with read-only requests or credential-free provider webhooks', () => {
    expect(check('GET', { cookie }).next).toHaveBeenCalled();
    expect(check('POST', { authorization: 'Bearer synthetic' }).next).toHaveBeenCalled();
  });
});
