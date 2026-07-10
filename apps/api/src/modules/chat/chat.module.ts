import { Module } from '@nestjs/common';

import { NoopRealtime, SoketiRealtime, type RealtimeAdapter } from '../../adapters/realtime.adapter';
import { loadEnv } from '../../config/env';
import { AuthModule } from '../auth/auth.module';
import { ChatController } from './chat.controller';
import { ChatService } from './chat.service';
import { REALTIME } from './chat.tokens';

@Module({
  imports: [AuthModule],
  controllers: [ChatController],
  providers: [
    ChatService,
    {
      provide: REALTIME,
      useFactory: (): RealtimeAdapter => {
        const env = loadEnv();
        if (env.SOKETI_HOST && env.SOKETI_APP_ID && env.SOKETI_KEY && env.SOKETI_SECRET) {
          return new SoketiRealtime({
            host: env.SOKETI_HOST,
            port: env.SOKETI_PORT,
            appId: env.SOKETI_APP_ID,
            key: env.SOKETI_KEY,
            secret: env.SOKETI_SECRET,
          });
        }
        // Soketi not provisioned yet (TECH.md) — chat persists, no live push.
        return new NoopRealtime();
      },
    },
  ],
  exports: [ChatService],
})
export class ChatModule {}
