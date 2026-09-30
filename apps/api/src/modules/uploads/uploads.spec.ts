import { createHash } from 'node:crypto';

import { ZodValidationPipe } from 'nestjs-zod';

import { signUploadSchema } from '@campushomes/shared';

import { DocumentsService, UploadsController, UploadsService } from './uploads.module';

const MB = 1024 * 1024;

/** In-memory stand-in for the INCR+EXPIRE Lua script (the system boundary). */
function fakeRedis(overrides: Record<string, unknown> = {}) {
  const counts = new Map<string, number>();
  return {
    status: 'ready',
    eval: async (_script: string, _n: number, key: string) => {
      const next = (counts.get(key) ?? 0) + 1;
      counts.set(key, next);
      return next;
    },
    ...overrides,
  } as never;
}

const jpeg = { contentType: 'image/jpeg', size: MB };

describe('upload signing boundary', () => {
  const originalEnv = process.env;
  beforeEach(() => {
    process.env = {
      DATABASE_URL: 'postgresql://unused/test', NODE_ENV: 'test',
      B2_S3_ENDPOINT: 'https://s3.example.invalid', B2_S3_REGION: 'us-east-1',
      B2_BUCKET: 'photos', B2_ACCESS_KEY_ID: 'fake-access-key', B2_SECRET_ACCESS_KEY: 'fake-secret',
    };
  });
  afterEach(() => { process.env = originalEnv; });

  it('uses the real SDK to bind MIME in the B2 signature without network calls', async () => {
    const result = await new UploadsService(fakeRedis()).sign('user', jpeg);
    expect(result.provider).toBe('b2');
    if (result.provider !== 'b2' || !('publicUrl' in result)) throw new Error('Expected B2 media');
    const url = new URL(result.uploadUrl);
    const signed = url.searchParams.get('X-Amz-SignedHeaders')?.split(';');
    expect(signed).toContain('content-type');
    expect(signed).toContain('content-length');
    expect(url.searchParams.get('X-Amz-Expires')).toBe('600');
    expect(result.publicUrl).toMatch(/^https:\/\/s3.example.invalid\/photos\/uploads\/user\//);
  });

  it.each(['text/html', 'image/svg+xml', 'IMAGE/JPEG', 'image/avif', 'image/jpeg\r\nX-Foo: bar'])('rejects unsafe type %s for both providers', async (type) => {
    await expect(new UploadsService(fakeRedis()).sign('user', { contentType: type, size: MB })).rejects.toThrow('Unsupported file type');
    delete process.env.B2_BUCKET;
    process.env.CLOUDINARY_URL = 'cloudinary://key:fake-secret@example';
    await expect(new UploadsService(fakeRedis()).sign('user', { contentType: type, size: MB })).rejects.toThrow('Unsupported file type');
  });

  it('binds the Cloudinary format allowlist and preserves PDF/image support', async () => {
    delete process.env.B2_BUCKET;
    process.env.CLOUDINARY_URL = 'cloudinary://key:fake-secret@example';
    const result = await new UploadsService(fakeRedis()).sign('user', { contentType: 'application/pdf', size: MB });
    if (result.provider !== 'cloudinary') throw new Error('Expected Cloudinary');
    expect(result.allowedFormats).toContain('pdf');
    expect(result.allowedFormats).not.toMatch(/html|svg|avif/);
    const expected = createHash('sha1').update(`allowed_formats=${result.allowedFormats}&folder=${result.folder}&timestamp=${result.timestamp}fake-secret`).digest('hex');
    expect(result.signature).toBe(expected);
    const omitted = createHash('sha1').update(`folder=${result.folder}&timestamp=${result.timestamp}fake-secret`).digest('hex');
    expect(result.signature).not.toBe(omitted);
  });
  it('rejects an image over 15 MB', async () => {
    await expect(new UploadsService(fakeRedis()).sign('user', { contentType: 'image/png', size: 15 * MB + 1 })).rejects.toThrow('File is too large');
  });

  it('accepts an image of exactly 15 MB', async () => {
    await expect(new UploadsService(fakeRedis()).sign('user', { contentType: 'image/png', size: 15 * MB })).resolves.toMatchObject({ provider: 'b2' });
  });

  it('rejects a PDF over 10 MB', async () => {
    await expect(new UploadsService(fakeRedis()).sign('user', { contentType: 'application/pdf', size: 10 * MB + 1 })).rejects.toThrow('File is too large');
  });

  it('rejects an oversized file for Cloudinary too', async () => {
    delete process.env.B2_BUCKET;
    process.env.CLOUDINARY_URL = 'cloudinary://key:fake-secret@example';
    await expect(new UploadsService(fakeRedis()).sign('user', { contentType: 'image/png', size: 16 * MB })).rejects.toThrow('File is too large');
  });

  it.each([{ contentType: 'image/jpeg' }, { contentType: 'image/jpeg', size: 0 }, { contentType: 'image/jpeg', size: 1.5 }, { contentType: 'image/jpeg', size: '1' }])(
    'rejects a sign body without a positive integer size %j',
    (body) => {
      expect(() => new ZodValidationPipe(signUploadSchema).transform(body, { type: 'body' })).toThrow();
    },
  );

  describe('document purpose', () => {
    const pdf = { contentType: 'application/pdf', size: MB, purpose: 'document' as const };
    const production = {
      NODE_ENV: 'production', WEB_ORIGIN: 'https://example.test', AUTH_APP_URL: 'https://example.test',
      LOGTO_ENDPOINT: 'https://auth.example.test', TRUSTED_PROXY_CIDRS: '127.0.0.1',
    };

    it('presigns the PUT against the private bucket', async () => {
      process.env.B2_PRIVATE_BUCKET = 'private-docs';
      const result = await new UploadsService(fakeRedis()).sign('user', pdf);
      if (result.provider !== 'b2') throw new Error('Expected B2');
      expect(new URL(result.uploadUrl).pathname).toMatch(/^\/private-docs\/uploads\/user\//);
    });

    it('returns a bare storage key instead of a public URL', async () => {
      process.env.B2_PRIVATE_BUCKET = 'private-docs';
      const result = await new UploadsService(fakeRedis()).sign('user', pdf);
      expect(result).toEqual({ provider: 'b2', uploadUrl: expect.any(String), storageKey: expect.stringMatching(/^uploads\/user\/[0-9a-f-]{36}$/) });
    });

    it('refuses with 503 in production when no private bucket is configured', async () => {
      Object.assign(process.env, production);
      await expect(new UploadsService(fakeRedis()).sign('user', pdf)).rejects.toMatchObject({ status: 503, message: 'Document uploads are not configured' });
    });

    it('falls back to the media bucket outside production when no private bucket is configured', async () => {
      const result = await new UploadsService(fakeRedis()).sign('user', pdf);
      expect(result).toMatchObject({ provider: 'b2', publicUrl: expect.stringMatching(/^https:\/\/s3.example.invalid\/photos\/uploads\/user\//) });
    });

    it('defaults the purpose to media when the body omits it', () => {
      expect(new ZodValidationPipe(signUploadSchema).transform(jpeg, { type: 'body' })).toEqual({ ...jpeg, purpose: 'media' });
    });

    it('rejects an unknown purpose', () => {
      expect(() => new ZodValidationPipe(signUploadSchema).transform({ ...jpeg, purpose: 'secret' }, { type: 'body' })).toThrow();
    });
  });

  describe('document-url reader identity', () => {
    const echo = { documentUrl: async (ctx: unknown) => ctx } as unknown as DocumentsService;
    const req = (roles: string[], mfaVerified: boolean) =>
      ({ session: { user: { id: 'u1' }, access: { roles, assurance: { mfaVerified } } } }) as never;

    it('reads as the MFA-verified staff role mapped from the session', async () => {
      const controller = new UploadsController(new UploadsService(fakeRedis()), echo);
      await expect(controller.documentUrl(req(['super_admin'], true), { key: 'k' })).resolves.toEqual({ userId: 'u1', role: 'admin', mfaVerified: true });
    });

    it('reads as a non-staff identity when the staff session lacks MFA', async () => {
      const controller = new UploadsController(new UploadsService(fakeRedis()), echo);
      await expect(controller.documentUrl(req(['ops_lead'], false), { key: 'k' })).resolves.toMatchObject({ role: 'student' });
    });
  });

  describe('per-user sign quota', () => {
    it('returns 429 with Retry-After on the 51st sign in an hour while another user still succeeds', async () => {
      const service = new UploadsService(fakeRedis());
      for (let i = 0; i < 50; i += 1) await service.sign('heavy-user', jpeg);
      const headers: Record<string, string> = {};
      const controller = new UploadsController(service, {} as DocumentsService);
      const res = { setHeader: (k: string, v: string) => { headers[k] = v; } } as never;
      const req = (id: string) => ({ session: { user: { id } } }) as never;

      await expect(controller.sign(req('heavy-user'), res, { ...jpeg, purpose: 'media' })).rejects.toMatchObject({ status: 429 });
      expect(Number(headers['Retry-After'])).toBeGreaterThan(0);
      expect(Number(headers['Retry-After'])).toBeLessThanOrEqual(3600);
      await expect(controller.sign(req('other-user'), res, { ...jpeg, purpose: 'media' })).resolves.toMatchObject({ provider: 'b2' });
    });

    it('fails closed with 503 when Redis is not ready', async () => {
      const service = new UploadsService(fakeRedis({ status: 'reconnecting' }));
      await expect(service.sign('user', jpeg)).rejects.toMatchObject({ status: 503 });
    });

    it('fails closed with 503 when the Redis command errors', async () => {
      const service = new UploadsService(fakeRedis({ eval: async () => { throw new Error('boom'); } }));
      await expect(service.sign('user', jpeg)).rejects.toMatchObject({ status: 503 });
    });
  });
});
