import { ServiceUnavailableException } from '@nestjs/common';

import type { Env } from './env';

export const PAYMENTS_DISABLED_MESSAGE =
  'Paid reservations are not available during the Phase 1 launch.';

/** Server-side product gate for every route that can initiate or apply money. */
export function assertPaymentsEnabled(env: Pick<Env, 'PAYMENTS_ENABLED'>): void {
  if (!env.PAYMENTS_ENABLED) {
    throw new ServiceUnavailableException(PAYMENTS_DISABLED_MESSAGE);
  }
}
