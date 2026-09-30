import crypto from 'node:crypto';

import { PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import {
  BadRequestException, Body, Controller, HttpException, Inject, Injectable, Module, Optional, Post, Req, Res, UseGuards,
} from '@nestjs/common';
import type { Response } from 'express';
import type { Redis } from 'ioredis';
import { createZodDto } from 'nestjs-zod';

import { signUploadSchema, type SignUploadInput } from '@campushomes/shared';

import { loadEnv } from '../../config/env';
import { REDIS } from '../../db/redis.module';
import { countInWindow } from '../../rate-limit';
import { AuthGuard, type AuthenticatedRequest } from '../auth/auth.guard';
import { AuthModule } from '../auth/auth.module';

// Only these can be uploaded/stored. Binding the type at signing (below) stops
// a caller from parking active content (text/html, image/svg+xml) on the
// public bucket and serving it as a stored-XSS / phishing payload.
const ALLOWED_UPLOAD_TYPES = new Set([
  'image/jpeg', 'image/png', 'image/webp', 'image/gif', 'application/pdf',
]);
// AVIF is excluded: its decoder was the vector of the Next.js image-optimizer RCE.

const MAX_IMAGE_BYTES = 15 * 1024 * 1024;
const MAX_PDF_BYTES = 10 * 1024 * 1024;
const SIGN_QUOTA_PER_HOUR = 50;
const SIGN_QUOTA_WINDOW_SEC = 3600;

class SignUploadDto extends createZodDto(signUploadSchema) {}

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

export type UploadSignParams = CloudinarySignParams | B2SignParams;

/** Signed direct-upload params (§10): clients upload straight to storage, the
 * API never proxies bytes. Backblaze B2 (S3-compatible) is used when its env
 * is set — a presigned PUT whose object URL is stored verbatim as storage_key
 * (the web helper's http passthrough renders it). Otherwise Cloudinary:
 * CLOUDINARY_URL = cloudinary://<api_key>:<api_secret>@<cloud_name>. */
@Injectable()
export class UploadsService {
  constructor(@Optional() @Inject(REDIS) private readonly redis: Redis | null = null) {}

  async sign(userId: string, { contentType, size }: SignUploadInput): Promise<UploadSignParams> {
    const env = loadEnv();
    if (!ALLOWED_UPLOAD_TYPES.has(contentType)) {
      throw new BadRequestException('Unsupported file type');
    }
    if (size > (contentType === 'application/pdf' ? MAX_PDF_BYTES : MAX_IMAGE_BYTES)) {
      throw new BadRequestException('File is too large');
    }
    await this.enforceQuota(userId);
    if (env.B2_S3_ENDPOINT && env.B2_S3_REGION && env.B2_BUCKET && env.B2_ACCESS_KEY_ID && env.B2_SECRET_ACCESS_KEY) {
      const key = `uploads/${userId}/${crypto.randomUUID()}`;
      const client = new S3Client({
        endpoint: env.B2_S3_ENDPOINT,
        region: env.B2_S3_REGION,
        forcePathStyle: true,
        credentials: { accessKeyId: env.B2_ACCESS_KEY_ID, secretAccessKey: env.B2_SECRET_ACCESS_KEY },
      });
      // ContentType and ContentLength are part of the signature: the browser PUT must send exactly
      // this type, and it is what B2 stores and later serves — so a caller
      // cannot park text/html or image/svg+xml (both scriptable) on the public
      // bucket. A PUT of any other length fails verification, so the size
      // cap above cannot be bypassed after signing.
      const uploadUrl = await getSignedUrl(
        client,
        new PutObjectCommand({ Bucket: env.B2_BUCKET, Key: key, ContentType: contentType, ContentLength: size }),
        // The AWS presigner excludes these by default even when they are on
        // the command. Explicitly opt them into the signed headers.
        { expiresIn: 600, signableHeaders: new Set(['content-type', 'content-length']) },
      );
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

@Controller('uploads')
@UseGuards(AuthGuard)
export class UploadsController {
  constructor(private readonly uploads: UploadsService) {}

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
  providers: [UploadsService],
})
export class UploadsModule {}
