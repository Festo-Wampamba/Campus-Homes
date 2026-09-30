import { createHash } from 'node:crypto';

import { UploadsService } from './uploads.module';

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
    const result = await new UploadsService().sign('user', 'image/jpeg');
    expect(result.provider).toBe('b2');
    if (result.provider !== 'b2') throw new Error('Expected B2');
    const url = new URL(result.uploadUrl);
    expect(url.searchParams.get('X-Amz-SignedHeaders')?.split(';')).toContain('content-type');
    expect(url.searchParams.get('X-Amz-Expires')).toBe('600');
    expect(result.publicUrl).toMatch(/^https:\/\/s3.example.invalid\/photos\/uploads\/user\//);
  });

  it.each([undefined, 'text/html', 'image/svg+xml', 'IMAGE/JPEG', 'image/jpeg\r\nX-Foo: bar'])('rejects unsafe type %s for both providers', async (type) => {
    await expect(new UploadsService().sign('user', type)).rejects.toThrow('Unsupported file type');
    delete process.env.B2_BUCKET;
    process.env.CLOUDINARY_URL = 'cloudinary://key:fake-secret@example';
    await expect(new UploadsService().sign('user', type)).rejects.toThrow('Unsupported file type');
  });

  it('binds the Cloudinary format allowlist and preserves PDF/image support', async () => {
    delete process.env.B2_BUCKET;
    process.env.CLOUDINARY_URL = 'cloudinary://key:fake-secret@example';
    const result = await new UploadsService().sign('user', 'application/pdf');
    if (result.provider !== 'cloudinary') throw new Error('Expected Cloudinary');
    expect(result.allowedFormats).toContain('pdf');
    expect(result.allowedFormats).not.toMatch(/html|svg/);
    const expected = createHash('sha1').update(`allowed_formats=${result.allowedFormats}&folder=${result.folder}&timestamp=${result.timestamp}fake-secret`).digest('hex');
    expect(result.signature).toBe(expected);
    const omitted = createHash('sha1').update(`folder=${result.folder}&timestamp=${result.timestamp}fake-secret`).digest('hex');
    expect(result.signature).not.toBe(omitted);
  });
});
