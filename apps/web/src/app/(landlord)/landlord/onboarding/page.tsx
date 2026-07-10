import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { getLandlordProfile, getMyProperties } from "@/lib/landlord";
import { OnboardingWizard } from "./onboarding-wizard";

export const metadata: Metadata = { title: "Landlord onboarding" };

export default async function OnboardingPage() {
  const [profile, properties] = await Promise.all([getLandlordProfile(), getMyProperties()]);

  // Onboarding is done once a property has been submitted — send returning
  // landlords straight to the dashboard instead of re-running the wizard.
  if (properties.length > 0) {
    redirect("/landlord");
  }

  const initialStep = !profile ? "legal" : !profile.idDocStorageKey ? "id-doc" : "property";

  return (
    <div className="flex flex-1 items-center justify-center py-8">
      <OnboardingWizard initialProfile={profile} initialStep={initialStep} />
    </div>
  );
}
