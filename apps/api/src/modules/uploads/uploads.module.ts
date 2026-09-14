import crypto from 'node:crypto';

import { PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { BadRequestException, Body, Controller, Injectable, Module, Post, Req, UseGuards } from '@nestjs/common';

import { loadEnv } from '../../config/env';
import { AuthGuard, type AuthenticatedRequest } from '../auth/auth.guard';
import { AuthModule } from '../auth/auth.module';

// Only these can be uploaded/stored. Binding the type at signing (below) stops
// a caller from parking active content (text/html, image/svg+xml) on the
// public bucket and serving it as a stored-XSS / phishing payload.
const ALLOWED_UPLOAD_TYPES = new Set([
  'image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/avif', 'application/pdf',
]);

export interface CloudinarySignParams {
  provider: 'cloudinary';
  cloudName: string;
  apiKey: string;
  timestamp: number;
  folder: string;
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
  async sign(userId: string, contentType?: string): Promise<UploadSignParams> {
    const env = loadEnv();
    if (env.B2_S3_ENDPOINT && env.B2_S3_REGION && env.B2_BUCKET && env.B2_ACCESS_KEY_ID && env.B2_SECRET_ACCESS_KEY) {
      if (!contentType || !ALLOWED_UPLOAD_TYPES.has(contentType)) {
        throw new BadRequestException('Unsupported file type');
      }
      const key = `uploads/${userId}/${crypto.randomUUID()}`;
      const client = new S3Client({
        endpoint: env.B2_S3_ENDPOINT,
        region: env.B2_S3_REGION,
        forcePathStyle: true,
        credentials: { accessKeyId: env.B2_ACCESS_KEY_ID, secretAccessKey: env.B2_SECRET_ACCESS_KEY },
      });
      // ContentType is part of the signature: the browser PUT must send exactly
      // this type, and it is what B2 stores and later serves — so a caller
      // cannot park text/html or image/svg+xml (both scriptable) on the public
      // bucket. The type is validated against the allowlist above first.
      const uploadUrl = await getSignedUrl(
        client,
        new PutObjectCommand({ Bucket: env.B2_BUCKET, Key: key, ContentType: contentType }),
        { expiresIn: 600 },
      );
      const base = env.B2_S3_ENDPOINT.replace(/\/+$/, '');
      return { provider: 'b2', uploadUrl, publicUrl: `${base}/${env.B2_BUCKET}/${key}` };
    }

    if (!env.CLOUDINARY_URL) {
      throw new Error('No upload storage configured (set B2_* or CLOUDINARY_URL)');
    }
    const parsed = new URL(env.CLOUDINARY_URL);
    const apiSecret = parsed.password;
    const timestamp = Math.floor(Date.now() / 1000);
    const folder = `uploads/${userId}`;
    const signature = crypto
      .createHash('sha1')
      .update(`folder=${folder}&timestamp=${timestamp}${apiSecret}`)
      .digest('hex');
    return { provider: 'cloudinary', cloudName: parsed.hostname, apiKey: parsed.username, timestamp, folder, signature };
  }
}

@Controller('uploads')
@UseGuards(AuthGuard)
export class UploadsController {
  constructor(private readonly uploads: UploadsService) {}

  @Post('sign')
  sign(@Req() req: AuthenticatedRequest, @Body() body: { contentType?: string }) {
    return this.uploads.sign(req.session.user.id, body?.contentType);
  }
}

@Module({
  imports: [AuthModule],
  controllers: [UploadsController],
  providers: [UploadsService],
})
export class UploadsModule {}
