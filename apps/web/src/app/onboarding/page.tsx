import { redirect } from "next/navigation";

import { AuthCard } from "@/components/auth-card";
import { IdleTimeout } from "@/components/shell/idle-timeout";
import { SignOutButton } from "@/components/shell/sign-out-button";
import { authorizedNext } from "@/lib/auth-routing";
import { getServerSession, needsProfileSetup } from "@/lib/session";
import { OnboardingForm } from "./onboarding-form";

export const metadata = { title: "Complete your profile" };

export default async function OnboardingPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const params = await searchParams;
  const session = await getServerSession();
  if (!session) redirect(`/sign-in?next=${encodeURIComponent(params.next ?? "/")}`);
  if (session.user.status !== "active") redirect("/account-pending");
  // Only a destination this account may actually open survives the hand-off.
  const next = authorizedNext(session.access, params.next) ?? "/choose-workspace";
  if (!needsProfileSetup(session.user)) redirect(next);

  return (
    <AuthCard title="Complete your profile">
      <p className="text-sm text-muted-foreground">
        Confirm your name, pick a username and add a phone number to finish setting up your CampusHomes account.
      </p>
      <IdleTimeout returnPath={next} signInPath={session.access.workspaces.includes("admin") || session.access.workspaces.includes("ops") ? "/staff" : "/sign-in"} />
      <OnboardingForm
        userId={session.user.id}
        staff={session.access.workspaces.includes("admin") || session.access.workspaces.includes("ops")}
        initialName={session.user.name ?? ""}
        initialUsername={session.user.username ?? ""}
        initialPhone={session.user.contactPhone ?? session.user.phoneNumber ?? ""}
        askGender={session.user.role === "student" || session.user.role === "landlord"}
        initialGender={session.user.gender ?? ""}
        next={next}
      />
      <SignOutButton />
    </AuthCard>
  );
}
