import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { SignOutButton } from "@/components/shell/sign-out-button";
import { Wordmark } from "@/components/shell/wordmark";
import { getLandlordProfile, getMyProperties } from "@/lib/landlord";
import { ONBOARDING_PATH, setupGate } from "@/lib/landlord-gate";
import { requireWorkspace } from "@/lib/session";

// Onboarding and the approval wait live outside the dashboard shell on
// purpose: entering /landlord from here mounts the (landlord) layout fresh,
// so its KYC gate always runs. When both shared one layout, the wizard's
// client-side navigation skipped the gate and pending landlords reached the
// dashboard.
export default async function LandlordSetupLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  await requireWorkspace("landlord");
  const path = (await headers()).get("x-campushomes-path") ?? ONBOARDING_PATH;
  const [profile, properties] = await Promise.all([getLandlordProfile(), getMyProperties()]);
  const destination = setupGate(profile, properties.length > 0, path);
  if (destination) redirect(destination);

  return (
    <div className="flex min-h-dvh flex-col bg-muted/30">
      <header className="flex items-center justify-between border-b border-border bg-background px-4 py-3 sm:px-6">
        <Wordmark />
        <SignOutButton />
      </header>
      <main className="flex flex-1 flex-col">{children}</main>
    </div>
  );
}
