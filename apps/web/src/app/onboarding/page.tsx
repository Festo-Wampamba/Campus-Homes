import { redirect } from "next/navigation";

import { AuthCard } from "@/components/auth-card";
import { SignOutButton } from "@/components/shell/sign-out-button";
import { getServerSession, needsProfileSetup } from "@/lib/session";
import { OnboardingForm } from "./onboarding-form";

export const metadata = { title: "Complete your profile" };

export default async function OnboardingPage() {
  const session = await getServerSession();
  if (!session) redirect("/sign-in?next=%2Fonboarding");
  if (session.user.status !== "active") redirect("/account-pending");
  if (!needsProfileSetup(session.user)) redirect("/choose-workspace");

  return (
    <AuthCard title="Complete your profile">
      <p className="text-sm text-muted-foreground">
        Pick a username and confirm your full name to finish setting up your CampusHomes account.
      </p>
      <OnboardingForm initialName={session.user.name ?? ""} initialUsername={session.user.username ?? ""} />
      <SignOutButton />
    </AuthCard>
  );
}
