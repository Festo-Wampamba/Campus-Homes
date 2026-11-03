import type { Metadata } from "next";
import { safeAuthDestination } from "@campushomes/shared";
import { redirect } from "next/navigation";
import { getServerSession } from "@/lib/session";
import { authDestination } from "@/lib/auth-routing";

import { SignInSurface } from "../sign-in/sign-in-surface";
import { hasVerifiedStaffSession, StaffSignIn } from "./staff-sign-in";

export const metadata: Metadata = { title: "Staff sign in", robots: { index: false, follow: false } };

export default async function StaffSignInPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; error?: string }>;
}) {
  const params = await searchParams;
  const next = safeAuthDestination(params.next);
  const session = await getServerSession();
  if (session && !params.error && hasVerifiedStaffSession(session.access)) redirect(authDestination(session, next));

  return (
    <SignInSurface>
      <StaffSignIn next={next} error={params.error ?? null} />
    </SignInSurface>
  );
}
