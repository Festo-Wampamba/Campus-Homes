import type { Metadata } from "next";
import { safeAuthDestination } from "@campushomes/shared";
import { redirect } from "next/navigation";
import { getServerSession } from "@/lib/session";
import { authDestination } from "@/lib/auth-routing";

import { isStaffPath } from "../staff/staff-sign-in";
import { SignInSurface } from "./sign-in-surface";
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
    <SignInSurface>
      <SignInForm next={next} error={params.error ?? null} />
    </SignInSurface>
  );
}
