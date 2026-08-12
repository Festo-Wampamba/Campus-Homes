import { createAuthClient } from "better-auth/react";
import {
  inferAdditionalFields,
  phoneNumberClient,
} from "better-auth/client/plugins";

/**
 * Better Auth runs on the API subdomain, while OAuth and email-auth flows
 * must return the browser to the web app. Relative callback URLs would be
 * resolved against the API host and end at a 404 there.
 */
export function appCallbackUrl(path: string): string {
  if (typeof window !== "undefined") {
    return new URL(path, window.location.origin).toString();
  }
  const configuredOrigin = process.env.NEXT_PUBLIC_APP_URL;
  return configuredOrigin ? new URL(path, configuredOrigin).toString() : path;
}

// Better Auth appends /api/auth to baseURL. Cookie-based sessions; the API
// must list this origin in trustedOrigins once a deployed env exists
// (FRONTEND.md §4) — localhost works without it.
export const authClient = createAuthClient({
  baseURL: process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:4000",
  fetchOptions: { credentials: "include" },
  plugins: [
    phoneNumberClient(),
    // role/status are server-set additionalFields (input: false on the API);
    // required: false here too, so client calls like signUp.email don't need
    // to (and can't meaningfully) pass them.
    inferAdditionalFields({
      user: {
        role: { type: "string", required: false },
        status: { type: "string", required: false },
      },
    }),
  ],
});
