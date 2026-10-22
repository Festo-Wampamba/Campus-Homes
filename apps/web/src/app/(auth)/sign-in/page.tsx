import type { Metadata } from "next";
import { safeAuthDestination } from "@campushomes/shared";
import { redirect } from "next/navigation";
import { getServerSession } from "@/lib/session";
import { authDestination } from "@/lib/auth-routing";

import { isStaffPath } from "../staff/staff-sign-in";
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
  // Old bookmarks and portal guards still send staff here with next=/admin|/ops.
  if (isStaffPath(next)) redirect(`/staff?${new URLSearchParams(params).toString()}`);
  const session = await getServerSession();
  if (session && !params.error) redirect(authDestination(session, next));

  return (
    // Keep the decorative gradient fixed to the viewport while the auth
    // content can scroll when the form and clock cannot fit on short screens.
    <div className="relative min-h-dvh w-full overflow-hidden bg-[#eef5f3]">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_12%_15%,rgba(252,177,119,0.32),transparent_32%),linear-gradient(135deg,#edf6f4_0%,#dcece8_52%,#c3ded9_100%)]" />
      <div className="relative flex min-h-dvh w-full items-center justify-center overflow-y-auto p-4 py-8 sm:p-8">
        <div className="flex w-full max-w-md flex-col gap-4">
          <LiveClock />
          <SignInForm next={next} error={params.error ?? null} />
        </div>
      </div>
    </div>
  );
}
