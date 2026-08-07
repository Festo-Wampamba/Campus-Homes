import { createAuthClient } from "better-auth/react";
import {
  inferAdditionalFields,
  phoneNumberClient,
} from "better-auth/client/plugins";

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
