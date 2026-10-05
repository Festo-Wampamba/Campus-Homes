import crypto from 'node:crypto';

import { GetObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import {
  BadRequestException, Body, Controller, ForbiddenException, Get, HttpException, Inject, Injectable, Logger, Module,
  OnModuleInit, Optional, Post, Query, Req, Res, ServiceUnavailableException, UseGuards,
} from '@nestjs/common';
import type { Response } from 'express';
import type { Redis } from 'ioredis';
import { createZodDto } from 'nestjs-zod';
import type { PoolClient } from 'pg';

import { documentUrlQuerySchema, signUploadSchema, type SignUploadInput } from '@campushomes/shared';

import { loadEnv, type Env } from '../../config/env';
import { RlsDb } from '../../db/db.module';
import { REDIS } from '../../db/redis.module';
import type { RlsContext } from '../../db/rls-context';
import { countInWindow } from '../../rate-limit';
import { effectiveRoles } from '../auth/access-resolver';
import { AuthGuard, type AuthenticatedRequest } from '../auth/auth.guard';
import { AuthModule } from '../auth/auth.module';
import { loadPermissions } from '../auth/permissions';
import { rlsCtx } from '../auth/roles';
import { assertStaffScope } from '../auth/staff-scope';
import { isOwnedStorageKey } from './storage-key';

// Only these can be uploaded/stored. Binding the type at signing (below) stops
// a caller from parking active content (text/html, image/svg+xml) on the
// public bucket and serving it as a stored-XSS / phishing payload.
const ALLOWED_UPLOAD_TYPES = new Set([
  'image/jpeg', 'image/png', 'image/webp', 'image/gif', 'application/pdf',
]);
// AVIF is excluded: its decoder was the vector of the Next.js image-optimizer RCE.

const MAX_IMAGE_BYTES = 15 * 1024 * 1024;
const MAX_PDF_BYTES = 10 * 1024 * 1024;
// One hostel onboarding signs 30+ images; 300 fits an inspector syncing several visits. The size cap bounds abuse.
const SIGN_QUOTA_PER_HOUR = 300;
const SIGN_QUOTA_WINDOW_SEC = 3600;

const DOCUMENT_URL_TTL_SEC = 300;
const STAFF_ROLES = ['admin', 'ops_lead', 'ops_inspector'];
const SERVICE_CTX: RlsContext = { userId: '00000000-0000-0000-0000-000000000000', role: 'service_role' };

class SignUploadDto extends createZodDto(signUploadSchema) {}
class DocumentUrlQueryDto extends createZodDto(documentUrlQuerySchema) {}

type B2Env = Env & Required<Pick<Env, 'B2_S3_ENDPOINT' | 'B2_S3_REGION' | 'B2_BUCKET' | 'B2_ACCESS_KEY_ID' | 'B2_SECRET_ACCESS_KEY'>>;

function isB2Configured(env: Env): env is B2Env {
  return Boolean(env.B2_S3_ENDPOINT && env.B2_S3_REGION && env.B2_BUCKET && env.B2_ACCESS_KEY_ID && env.B2_SECRET_ACCESS_KEY);
}

function b2Client(env: B2Env): S3Client {
  return new S3Client({
    endpoint: env.B2_S3_ENDPOINT,
    region: env.B2_S3_REGION,
    forcePathStyle: true,
    credentials: { accessKeyId: env.B2_ACCESS_KEY_ID, secretAccessKey: env.B2_SECRET_ACCESS_KEY },
  });
}

/** HttpException whose Retry-After the controller copies onto the response. */
class RetryAfterException extends HttpException {
  constructor(status: number, message: string, readonly retryAfter: number) {
    super({ statusCode: status, message }, status);
  }
}

export interface CloudinarySignParams {
  provider: 'cloudinary';
  cloudName: string;
  apiKey: string;
  timestamp: number;
  folder: string;
  allowedFormats: string;
  signature: string;
}

export interface B2SignParams {
  provider: 'b2';
  /** Short-lived presigned PUT the browser uploads the bytes to. */
  uploadUrl: string;
  /** Stable public GET URL stored as the photo's storage_key. */
  publicUrl: string;
}

export interface B2DocumentSignParams {
  provider: 'b2';
  uploadUrl: string;
  /** Bare private-bucket key; readable only via GET /uploads/document-url. */
  storageKey: string;
}

export type UploadSignParams = CloudinarySignParams | B2SignParams | B2DocumentSignParams;

/** Signed direct-upload params (§10): clients upload straight to storage, the
 * API never proxies bytes. Backblaze B2 (S3-compatible) is used when its env
 * is set — a presigned PUT whose object URL is stored verbatim as storage_key
 * (the web helper's http passthrough renders it). Otherwise Cloudinary:
 * CLOUDINARY_URL = cloudinary://<api_key>:<api_secret>@<cloud_name>. */
@Injectable()
export class UploadsService implements OnModuleInit {
  private readonly logger = new Logger(UploadsService.name);

  constructor(@Optional() @Inject(REDIS) private readonly redis: Redis | null = null) {}

  onModuleInit(): void {
    const env = loadEnv();
    // No boot-time signal otherwise: drawn signatures/ID docs would just 503 at runtime.
    if (env.NODE_ENV === 'production' && isB2Configured(env) && !env.B2_PRIVATE_BUCKET) {
      this.logger.warn('B2_PRIVATE_BUCKET is not set: document uploads will return 503 until it is configured');
    }
  }

  async sign(userId: string, { contentType, size, purpose }: SignUploadInput): Promise<UploadSignParams> {
    const env = loadEnv();
    if (!ALLOWED_UPLOAD_TYPES.has(contentType)) {
      throw new BadRequestException('Unsupported file type');
    }
    if (size > (contentType === 'application/pdf' ? MAX_PDF_BYTES : MAX_IMAGE_BYTES)) {
      throw new BadRequestException('File is too large');
    }
    const privateBucket = purpose === 'document' && isB2Configured(env) ? env.B2_PRIVATE_BUCKET : undefined;
    // Identity documents must never land on public storage in production.
    if (purpose === 'document' && !privateBucket && env.NODE_ENV === 'production') {
      throw new ServiceUnavailableException('Document uploads are not configured');
    }
    await this.enforceQuota(userId);
    if (purpose === 'document' && !privateBucket) {
      this.logger.warn('B2_PRIVATE_BUCKET is not set; storing a document in public media storage (non-production only)');
    }
    if (isB2Configured(env)) {
      const key = `uploads/${userId}/${crypto.randomUUID()}`;
      // ContentType and ContentLength are part of the signature: the browser PUT must send exactly
      // this type, and it is what B2 stores and later serves — so a caller
      // cannot park text/html or image/svg+xml (both scriptable) on the public
      // bucket. A PUT of any other length fails verification, so the size
      // cap above cannot be bypassed after signing.
      const uploadUrl = await getSignedUrl(
        b2Client(env),
        new PutObjectCommand({ Bucket: privateBucket ?? env.B2_BUCKET, Key: key, ContentType: contentType, ContentLength: size }),
        // The AWS presigner excludes these by default even when they are on
        // the command. Explicitly opt them into the signed headers.
        { expiresIn: 600, signableHeaders: new Set(['content-type', 'content-length']) },
      );
      if (privateBucket) return { provider: 'b2', uploadUrl, storageKey: key };
      const base = env.B2_S3_ENDPOINT.replace(/\/+$/, '');
      return { provider: 'b2', uploadUrl, publicUrl: `${base}/${env.B2_BUCKET}/${key}` };
    }

    if (!env.CLOUDINARY_URL) {
      throw new Error('No upload storage configured (set B2_* or CLOUDINARY_URL)');
    }
    const parsed = new URL(env.CLOUDINARY_URL);
    const apiSecret = parsed.password;
    // Cloudinary signatures cannot bind a length, so only the check above limits size here.
    const timestamp = Math.floor(Date.now() / 1000);
    const folder = `uploads/${userId}`;
    const allowedFormats = 'jpg,jpeg,png,webp,gif,pdf';
    const signature = crypto
      .createHash('sha1')
      .update(`allowed_formats=${allowedFormats}&folder=${folder}&timestamp=${timestamp}${apiSecret}`)
      .digest('hex');
    return { provider: 'cloudinary', cloudName: parsed.hostname, apiKey: parsed.username, timestamp, folder, allowedFormats, signature };
  }

  // Signing is cheap but every signature authorises a public-bucket write, so
  // it is capped per user. Fails closed like the write limiter; a null Redis
  // only occurs outside production (the module refuses to boot without it).
  private async enforceQuota(userId: string): Promise<void> {
    if (!this.redis) return;
    const now = Math.floor(Date.now() / 1000);
    const retryAfter = SIGN_QUOTA_WINDOW_SEC - (now % SIGN_QUOTA_WINDOW_SEC);
    let count: number;
    try {
      count = await countInWindow(this.redis, `rl:upload-sign:${userId}:${Math.floor(now / SIGN_QUOTA_WINDOW_SEC)}`, SIGN_QUOTA_WINDOW_SEC);
    } catch {
      throw new RetryAfterException(503, 'Please try again shortly.', 5);
    }
    if (count > SIGN_QUOTA_PER_HOUR) {
      throw new RetryAfterException(429, 'Too many upload requests. Please try again later.', retryAfter);
    }
  }
}

type DocumentAccess = boolean | 'needs_kyc_permission';

/** Presigned reads of private documents, issued only to a reader authorized
 * for a row that references the key (or to its uploader before submission). */
@Injectable()
export class DocumentsService {
  constructor(private readonly rlsDb: RlsDb) {}

  /** `ctx.role` is the caller's MFA-verified staff role, else a non-staff role. */
  async documentUrl(ctx: RlsContext, key: string): Promise<{ url: string }> {
    const access = await this.rlsDb.run(SERVICE_CTX, (_db, client) => this.access(client, ctx, key));
    // Same rule PermissionsGuard applies to the admin KYC routes.
    const allowed = access === 'needs_kyc_permission'
      ? STAFF_ROLES.includes(ctx.role) && ctx.mfaVerified === true &&
        (await loadPermissions(this.rlsDb, ctx.userId)).permissions.has('landlords.review_kyc')
      : access;
    if (!allowed) throw new ForbiddenException('You cannot view this document');
    // Legacy rows hold public object URLs from before the private bucket existed.
    if (/^https?:\/\//i.test(key)) return { url: key };
    const env = loadEnv();
    if (!isB2Configured(env) || !env.B2_PRIVATE_BUCKET) {
      throw new ServiceUnavailableException('Document storage is not configured');
    }
    const url = await getSignedUrl(
      b2Client(env),
      new GetObjectCommand({ Bucket: env.B2_PRIVATE_BUCKET, Key: key }),
      { expiresIn: DOCUMENT_URL_TTL_SEC },
    );
    return { url };
  }

  private async access(client: PoolClient, ctx: RlsContext, key: string): Promise<DocumentAccess> {
    const { rows: idDocs } = await client.query<{ user_id: string }>(
      'SELECT user_id FROM landlords WHERE id_doc_storage_key = $1',
      [key],
    );
    const { rows: propertyDocs } = await client.query<{ property_id: string; landlord_id: string }>(
      `SELECT d.property_id, p.landlord_id FROM property_documents d
       JOIN properties p ON p.id = d.property_id WHERE d.storage_key = $1`,
      [key],
    );
    const { rows: signatures } = await client.query<{ student_id: string; landlord_id: string; is_custodian: boolean }>(
      `SELECT a.student_id, p.landlord_id, EXISTS (
         SELECT 1 FROM property_memberships m
         WHERE m.property_id = a.property_id AND m.user_id = $2 AND m.role = 'custodian'
           AND m.status = 'active' AND m.revoked_at IS NULL AND m.starts_at <= now()
           AND (m.ends_at IS NULL OR m.ends_at > now())
       ) AS is_custodian
       FROM tenant_agreements a JOIN properties p ON p.id = a.property_id
       WHERE a.signature_storage_key = $1`,
      [key, ctx.userId],
    );
    if (!idDocs.length && !propertyDocs.length && !signatures.length) {
      // Unsubmitted upload: only its uploader may preview it.
      return isOwnedStorageKey(ctx.userId, key);
    }
    if (idDocs.some((row) => row.user_id === ctx.userId)
      || propertyDocs.some((row) => row.landlord_id === ctx.userId)
      || signatures.some((row) => row.student_id === ctx.userId || row.landlord_id === ctx.userId || row.is_custodian)) {
      return true;
    }
    // Ownership documents are KYC evidence: covering the property is not
    // enough, the staff reader must also hold landlords.review_kyc.
    for (const row of propertyDocs) {
      try {
        await assertStaffScope(client, ctx, row.property_id);
        return 'needs_kyc_permission';
      } catch (error) {
        if (!(error instanceof ForbiddenException)) throw error;
      }
    }
    return idDocs.length ? 'needs_kyc_permission' : false;
  }
}

@Controller('uploads')
@UseGuards(AuthGuard)
export class UploadsController {
  constructor(
    private readonly uploads: UploadsService,
    private readonly documents: DocumentsService,
  ) {}

  @Get('document-url')
  documentUrl(
    @Req() req: AuthenticatedRequest,
    @Res({ passthrough: true }) res: Response,
    @Query() query: DocumentUrlQueryDto,
  ) {
    // The body is a per-user bearer URL; never let a shared cache store it.
    res.setHeader('Cache-Control', 'no-store');
    // No route-level role here, so resolve the staff role the way
    // PermissionsGuard does; rlsCtx drops it again when MFA is missing.
    req.effectiveRole = effectiveRoles(req.session.access.roles).find((role) => STAFF_ROLES.includes(role));
    return this.documents.documentUrl(rlsCtx(req), query.key);
  }

  @Post('sign')
  async sign(
    @Req() req: AuthenticatedRequest,
    @Res({ passthrough: true }) res: Response,
    @Body() body: SignUploadDto,
  ) {
    try {
      return await this.uploads.sign(req.session.user.id, body);
    } catch (error) {
      if (error instanceof RetryAfterException) res.setHeader('Retry-After', String(error.retryAfter));
      throw error;
    }
  }
}

@Module({
  imports: [AuthModule],
  controllers: [UploadsController],
  providers: [UploadsService, DocumentsService],
})
export class UploadsModule {}
