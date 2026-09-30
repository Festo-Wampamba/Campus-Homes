import { BadRequestException } from '@nestjs/common';

import { assertOwnedStorageKeys, isOwnedStorageKey } from './storage-key';

const USER = '11111111-1111-4111-8111-111111111111';
const OTHER = '22222222-2222-4222-8222-222222222222';
const ENDPOINT = 'https://s3.eu-central-003.backblazeb2.com';
const BUCKET = 'campushomes-media-production';
const env = {
  NODE_ENV: 'production',
  B2_S3_ENDPOINT: ENDPOINT,
  B2_BUCKET: BUCKET,
} as Parameters<typeof isOwnedStorageKey>[2];
const url = (userId: string, tail = 'abc-123') => `${ENDPOINT}/${BUCKET}/uploads/${userId}/${tail}`;

describe('isOwnedStorageKey', () => {
  it('accepts the caller\'s own bare key', () => {
    expect(isOwnedStorageKey(USER, `uploads/${USER}/abc_123`, env)).toBe(true);
  });

  it('accepts the caller\'s own bare key with an extension', () => {
    expect(isOwnedStorageKey(USER, `uploads/${USER}/abc_123.jpg`, env)).toBe(true);
  });

  it('accepts the caller\'s own full B2 URL', () => {
    expect(isOwnedStorageKey(USER, url(USER), env)).toBe(true);
  });

  it.each([
    ['another user\'s bare key', `uploads/${OTHER}/abc`],
    ['another user\'s B2 URL', url(OTHER)],
    ['a foreign host', `https://evil.example/${BUCKET}/uploads/${USER}/abc`],
    ['a different bucket', `${ENDPOINT}/other-bucket/uploads/${USER}/abc`],
    ['a javascript: URI', 'javascript:alert(1)'],
    ['a data: URI', 'data:image/png;base64,AAAA'],
    ['a traversal bare key', `uploads/${USER}/../${OTHER}/x`],
    ['a URL with a query string', `${url(USER)}?x=1`],
    ['a URL with a fragment', `${url(USER)}#x`],
    ['a URL with an encoded slash in the last segment', url(USER, 'a%2Fb')],
    ['a URL with credentials', `https://u:p@s3.eu-central-003.backblazeb2.com/${BUCKET}/uploads/${USER}/abc`],
    ['an http URL in production', url(USER).replace('https:', 'http:')],
    ['a bare key with an extra path segment', `uploads/${USER}/a/b`],
    ['an empty string', ''],
  ])('rejects %s', (_label, key) => {
    expect(isOwnedStorageKey(USER, key, env)).toBe(false);
  });

  it('rejects a B2 URL when B2 is not configured', () => {
    expect(isOwnedStorageKey(USER, url(USER), { NODE_ENV: 'production' } as Parameters<typeof isOwnedStorageKey>[2])).toBe(false);
  });

  it('accepts an http B2 URL outside production', () => {
    const local = { NODE_ENV: 'development', B2_S3_ENDPOINT: 'http://localhost:9000', B2_BUCKET: BUCKET } as Parameters<typeof isOwnedStorageKey>[2];
    expect(isOwnedStorageKey(USER, `http://localhost:9000/${BUCKET}/uploads/${USER}/abc`, local)).toBe(true);
  });
});

describe('assertOwnedStorageKeys', () => {
  it('throws BadRequestException naming the rule on the first foreign key', () => {
    expect(() => assertOwnedStorageKeys(USER, [`uploads/${USER}/ok`, `uploads/${OTHER}/no`], env)).toThrow(
      new BadRequestException('Attachment must be a file you uploaded'),
    );
  });

  it('passes when every key is owned', () => {
    expect(() => assertOwnedStorageKeys(USER, [`uploads/${USER}/ok`, url(USER)], env)).not.toThrow();
  });
});
