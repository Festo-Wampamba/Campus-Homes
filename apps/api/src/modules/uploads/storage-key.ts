import { BadRequestException } from '@nestjs/common';

import { loadEnv, type Env } from '../../config/env';

type StorageEnv = Pick<Env, 'NODE_ENV' | 'B2_S3_ENDPOINT' | 'B2_BUCKET' | 'B2_PRIVATE_BUCKET'>;

const escapeRegExp = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** True only for an object the caller uploaded through POST /uploads/sign:
 * a bare Cloudinary-style key `uploads/<userId>/<id>[.ext]`, or the full
 * public B2 URL `<endpoint>/<bucket>/uploads/<userId>/<id>`. Anything else
 * (foreign hosts, other users' objects, javascript:/data: URIs, traversal)
 * would be rendered to other viewers verbatim, so it is never accepted. */
export function isOwnedStorageKey(userId: string, key: string, env: StorageEnv = loadEnv()): boolean {
  const user = escapeRegExp(userId);
  if (new RegExp(`^uploads/${user}/[A-Za-z0-9_-]+(\\.[A-Za-z0-9]+)?$`).test(key)) return true;

  if (!env.B2_S3_ENDPOINT || !env.B2_BUCKET) return false;
  let url: URL;
  try {
    url = new URL(key);
  } catch {
    return false;
  }
  const allowedProtocol = url.protocol === 'https:' || (url.protocol === 'http:' && env.NODE_ENV !== 'production');
  if (!allowedProtocol || url.username || url.password || url.search || url.hash) return false;
  if (url.origin !== new URL(env.B2_S3_ENDPOINT).origin) return false;
  // pathname keeps %2F encoded, so an encoded slash can't smuggle an extra segment past the regex.
  return new RegExp(`^/${escapeRegExp(env.B2_BUCKET)}/uploads/${user}/[A-Za-z0-9_-]+$`).test(url.pathname);
}

export function assertOwnedStorageKeys(userId: string, keys: string[], env: StorageEnv = loadEnv()): void {
  for (const key of keys) {
    if (!isOwnedStorageKey(userId, key, env)) {
      throw new BadRequestException('Attachment must be a file you uploaded');
    }
  }
}

/** A NEW identity-document value. Once the private bucket exists, /uploads/sign
 * hands out bare keys for documents, so a full public URL (or any other
 * spelling) can only point at the public media bucket and is refused. */
export function assertOwnedDocumentKey(userId: string, key: string, env: StorageEnv = loadEnv()): void {
  assertOwnedStorageKeys(userId, [key], env);
  if (env.B2_PRIVATE_BUCKET && !key.startsWith('uploads/')) {
    throw new BadRequestException('Documents must be uploaded as private documents');
  }
}
