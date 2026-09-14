import crypto from 'node:crypto';

import { PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { Controller, Injectable, Module, Post, Req, UseGuards } from '@nestjs/common';

import { loadEnv } from '../../config/env';
import { AuthGuard, type AuthenticatedRequest } from '../auth/auth.guard';
import { AuthModule } from '../auth/auth.module';

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
  async sign(userId: string): Promise<UploadSignParams> {
    const env = loadEnv();
    if (env.B2_S3_ENDPOINT && env.B2_S3_REGION && env.B2_BUCKET && env.B2_ACCESS_KEY_ID && env.B2_SECRET_ACCESS_KEY) {
      const key = `uploads/${userId}/${crypto.randomUUID()}`;
      const client = new S3Client({
        endpoint: env.B2_S3_ENDPOINT,
        region: env.B2_S3_REGION,
        forcePathStyle: true,
        credentials: { accessKeyId: env.B2_ACCESS_KEY_ID, secretAccessKey: env.B2_SECRET_ACCESS_KEY },
      });
      // ContentType is deliberately left unsigned: the browser sends its own
      // Content-Type header on the PUT and B2 stores it, without every caller
      // having to pass the file type into this signing request.
      const uploadUrl = await getSignedUrl(
        client,
        new PutObjectCommand({ Bucket: env.B2_BUCKET, Key: key }),
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
  sign(@Req() req: AuthenticatedRequest) {
    return this.uploads.sign(req.session.user.id);
  }
}

@Module({
  imports: [AuthModule],
  controllers: [UploadsController],
  providers: [UploadsService],
})
export class UploadsModule {}
