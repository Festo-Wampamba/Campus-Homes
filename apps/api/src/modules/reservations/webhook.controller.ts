import { Controller, HttpCode, NotImplementedException, Post } from '@nestjs/common';

/** Dormant since the bed-level redesign (2026-09): Reserved -> Booked is now
 * a landlord/custodian confirmation (`POST /reservations/book`), not an
 * online-payment webhook — there is no more `applyPaymentWebhook` for this
 * to call. Left in place, unregistered from any live payment gateway, for
 * Phase 2 real-money work to fill back in rather than deleting the route
 * shape outright. */
@Controller('webhooks')
export class WebhookController {
  @Post('flutterwave')
  @HttpCode(200)
  flutterwave() {
    throw new NotImplementedException(
      'Online payment webhooks are dormant — booking is landlord-confirmed offline in the current model',
    );
  }

  @Post('dev-simulate')
  @HttpCode(200)
  devSimulate() {
    throw new NotImplementedException(
      'Online payment webhooks are dormant — booking is landlord-confirmed offline in the current model',
    );
  }
}
