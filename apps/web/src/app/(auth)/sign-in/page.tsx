import type { Metadata } from "next";

import { LiveClock } from "./live-clock";
import { SignInForm } from "./sign-in-form";

export const metadata: Metadata = { title: "Sign in" };

export default function SignInPage() {
  return (
    // The gradient/clock backdrop is fixed to the viewport (overflow-hidden)
    // so it never moves — only the inner flex region scrolls, and only if
    // the card genuinely can't fit (very short viewports). This keeps the
    // page itself scroll-free in the normal case while guaranteeing content
    // is never clipped/unreachable the way a blanket overflow-hidden would.
    <div className="relative h-dvh w-full overflow-hidden bg-gradient-to-br from-teal-700 via-teal-800 to-teal-950">
      <div className="absolute inset-x-0 bottom-0 hidden p-8 sm:block sm:p-10">
        <LiveClock />
      </div>
      <div className="flex h-full w-full items-center justify-center overflow-y-auto p-4 py-8 sm:p-8">
        <SignInForm />
      </div>
    </div>
  );
}
