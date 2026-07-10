import {
  BadRequestException,
  Body,
  Controller,
  Headers,
  HttpCode,
  Post,
  UnauthorizedException,
} from '@nestjs/common';

import { loadEnv } from '../../config/env';
import { ReservationsService } from './reservations.service';

interface FlutterwaveWebhookBody {
  event?: string;
  data?: {
    id?: number | string;
    tx_ref?: string;
    status?: string;
    payment_type?: string;
    [k: string]: unknown;
  };
}

/** Flutterwave calls this — no session auth; authenticity comes from the
 * verif-hash header matching FLUTTERWAVE_WEBHOOK_HASH (their signing model).
 * Always 200 on handled duplicates so their retry loop stops. */
@Controller('webhooks')
export class WebhookController {
  private readonly webhookHash = loadEnv().FLUTTERWAVE_WEBHOOK_HASH;

  constructor(private readonly reservationsService: ReservationsService) {}

  @Post('flutterwave')
  @HttpCode(200)
  async flutterwave(
    @Headers('verif-hash') verifHash: string | undefined,
    @Body() body: FlutterwaveWebhookBody,
  ) {
    if (!this.webhookHash) {
      // Gateway not configured yet (TECH.md: payments deferred) — reject all.
      throw new UnauthorizedException('Webhook not configured');
    }
    if (!verifHash || verifHash !== this.webhookHash) {
      throw new UnauthorizedException('Bad webhook signature');
    }
    const data = body.data;
    if (!data?.tx_ref || data.id === undefined || !data.status) {
      throw new BadRequestException('Malformed webhook payload');
    }
    return this.reservationsService.applyPaymentWebhook({
      txRef: data.tx_ref,
      providerTxnId: String(data.id),
      status: data.status === 'successful' ? 'successful' : 'failed',
      paymentMethod: data.payment_type,
      raw: body as Record<string, unknown>,
    });
  }
}
