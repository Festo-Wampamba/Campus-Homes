import { redirect } from "next/navigation";
import { safeAuthDestination } from "@campushomes/shared";
import { AuthCard } from "@/components/auth-card";
import { authDestination } from "@/lib/auth-routing";
import { getServerSession, needsProfileSetup } from "@/lib/session";

// This page's whole job is to read the just-set session cookie and route
// off it — caching its HTML (Next was serving it `x-nextjs-cache: HIT` with
// s-maxage=1yr) freezes every visitor onto whatever the first-ever render
// happened to hydrate as, causing exactly the intermittent stuck/blank
// behavior QA hit on staff sign-in.
export const dynamic = "force-dynamic";

export default async function AuthCallbackPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const next = safeAuthDestination((await searchParams).next);
  const session = await getServerSession();
  if (!session) {
    return (
      <AuthCard title="Session not found">
        <p className="text-sm text-muted-foreground">We couldn&apos;t verify your new session. Please sign in again.</p>
        <a className="block font-semibold underline" href={`/sign-in${next ? `?next=${encodeURIComponent(next)}` : ""}`}>Sign in</a>
      </AuthCard>
    );
  }
  const destination = authDestination(session, next);
  // A new account completes its profile right after sign-up, then lands where
  // it was heading, not later when it first opens a portal page.
  if (session.user.status === "active" && needsProfileSetup(session.user)) {
    redirect(`/onboarding?next=${encodeURIComponent(destination)}`);
  }
  redirect(destination);
}
