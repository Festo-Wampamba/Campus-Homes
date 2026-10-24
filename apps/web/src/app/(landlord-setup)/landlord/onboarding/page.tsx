import type { Metadata } from "next";
import { getLandlordProfile } from "@/lib/landlord";
import { getServerSession } from "@/lib/session";
import { OnboardingWizard } from "./onboarding-wizard";

export const metadata: Metadata = { title: "Landlord onboarding" };

// The (landlord-setup) layout sends landlords who already submitted a
// property to the review page (or the dashboard once verified).
export default async function OnboardingPage() {
  const [profile, session] = await Promise.all([getLandlordProfile(), getServerSession()]);
  const initialStep = !profile ? "legal" : "property";

  return (
    <div className="flex flex-1 items-start justify-center px-4 py-10 sm:px-8">
      <OnboardingWizard
        initialProfile={profile}
        initialStep={initialStep}
        // Per account, so a draft is never offered to someone else signing in on this tab.
        draftKey={`landlord-onboarding-draft:${session?.user.id}`}
      />
    </div>
  );
}
