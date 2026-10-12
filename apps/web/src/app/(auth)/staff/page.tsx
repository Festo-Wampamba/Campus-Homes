import type { Metadata } from "next";
import { safeAuthDestination } from "@campushomes/shared";
import { redirect } from "next/navigation";
import { getServerSession } from "@/lib/session";
import { authDestination } from "@/lib/auth-routing";

import { LiveClock } from "../sign-in/live-clock";
import { StaffSignIn } from "./staff-sign-in";

export const metadata: Metadata = { title: "Staff sign in", robots: { index: false, follow: false } };

export default async function StaffSignInPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; error?: string }>;
}) {
  const params = await searchParams;
  const next = safeAuthDestination(params.next);
  const session = await getServerSession();
  if (session && !params.error) redirect(authDestination(session, next));

  // Same fixed backdrop as /sign-in (see the notes there on scrolling and
  // the click-through clock band).
  return (
    <div className="relative h-dvh w-full overflow-hidden bg-gradient-to-br from-teal-700 via-teal-800 to-teal-950">
      <div className="pointer-events-none absolute inset-x-0 bottom-0 hidden p-8 sm:block sm:p-10">
        <LiveClock />
      </div>
      <div className="flex h-full w-full items-center justify-center overflow-y-auto p-4 py-8 sm:p-8">
        <StaffSignIn next={next} error={params.error ?? null} />
      </div>
    </div>
  );
}
