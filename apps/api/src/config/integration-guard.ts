import { Logger } from '@nestjs/common';

import type { Env } from './env';

/**
 * Decides whether a module may fall back to its stub adapter.
 *
 * Outside production, stubs are the normal path. Inside production they are a
 * deliberate, opt-in staging posture — never a silent default — so this throws
 * unless ALLOW_STUB_INTEGRATIONS is explicitly set.
 *
 * Shared by every module factory that has a stub so the rule and its wording
 * cannot drift apart between call sites (same reasoning as the particulars
 * field allowlist).
 */
export function assertStubAllowed(env: Env, secretName: string, moduleName: string): void {
  if (env.NODE_ENV !== 'production') return;
  if (!env.ALLOW_STUB_INTEGRATIONS) {
    throw new Error(`${moduleName} requires ${secretName} in production`);
  }
  // Loud on every boot: a staging deploy that quietly forgot it was running on
  // stubs is exactly how a stub reaches real users.
  new Logger(moduleName).warn(
    `${secretName} is not set — running on the stub adapter because ALLOW_STUB_INTEGRATIONS=true. ` +
      'Not suitable for real users; set the real secret before launch.',
  );
}
