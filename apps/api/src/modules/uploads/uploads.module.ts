import crypto from 'node:crypto';

import { Controller, Injectable, Module, Post, Req, UseGuards } from '@nestjs/common';

import { loadEnv } from '../../config/env';
import { AuthGuard, type AuthenticatedRequest } from '../auth/auth.guard';
import { AuthModule } from '../auth/auth.module';

/** Cloudinary signed-upload params (§10): clients upload directly to
 * Cloudinary with a short-lived signature — the API never proxies bytes.
 * CLOUDINARY_URL format: cloudinary://<api_key>:<api_secret>@<cloud_name> */
@Injectable()
export class UploadsService {
  sign(userId: string): {
    cloudName: string;
    apiKey: string;
    timestamp: number;
    folder: string;
    signature: string;
  } {
    const url = loadEnv().CLOUDINARY_URL;
    if (!url) {
      throw new Error('CLOUDINARY_URL is not configured');
    }
    const parsed = new URL(url);
    const apiKey = parsed.username;
    const apiSecret = parsed.password;
    const cloudName = parsed.hostname;

    const timestamp = Math.floor(Date.now() / 1000);
    const folder = `uploads/${userId}`;
    // Cloudinary signature: sha1 over the sorted params + api_secret.
    const toSign = `folder=${folder}&timestamp=${timestamp}${apiSecret}`;
    const signature = crypto.createHash('sha1').update(toSign).digest('hex');
    return { cloudName, apiKey, timestamp, folder, signature };
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
