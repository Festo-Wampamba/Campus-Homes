import type { Metadata } from "next";
import { safeAuthDestination } from "@campushomes/shared";
import { redirect } from "next/navigation";
import { getServerSession } from "@/lib/session";
import { authDestination } from "@/lib/auth-routing";

import { LiveClock } from "./live-clock";
import { SignInForm } from "./sign-in-form";

export const metadata: Metadata = { title: "Sign in" };

export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; error?: string }>;
}) {
  const params = await searchParams;
  const next = safeAuthDestination(params.next);
  const session = await getServerSession();
  if (session && !params.error) redirect(authDestination(session, next));

  return (
    // The gradient/clock backdrop is fixed to the viewport (overflow-hidden)
    // so it never moves — only the inner flex region scrolls, and only if
    // the card genuinely can't fit (very short viewports). This keeps the
    // page itself scroll-free in the normal case while guaranteeing content
    // is never clipped/unreachable the way a blanket overflow-hidden would.
    <div className="relative h-dvh w-full overflow-hidden bg-gradient-to-br from-teal-700 via-teal-800 to-teal-950">
      {/* pointer-events-none here (not just inside LiveClock) matters: this
          wrapper is `absolute`, so CSS paints it above the normal-flow card
          below regardless of DOM order. On a viewport short enough that the
          card's lower buttons fall inside this bottom-anchored padded band,
          an intercepting click here would silently swallow the click — the
          button looks normal but does nothing. */}
      <div className="pointer-events-none absolute inset-x-0 bottom-0 hidden p-8 sm:block sm:p-10">
        <LiveClock />
      </div>
      <div className="flex h-full w-full items-center justify-center overflow-y-auto p-4 py-8 sm:p-8">
        <SignInForm next={next} error={params.error ?? null} />
      </div>
    </div>
  );
}
