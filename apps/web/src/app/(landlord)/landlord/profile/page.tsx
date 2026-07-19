import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { getLandlordProfile } from "@/lib/landlord";
import { KycBanner } from "@/components/kyc-banner";
import { LandlordProfileForm } from "./landlord-profile-form";

export const metadata: Metadata = { title: "Your profile" };

export default async function LandlordProfilePage() {
  const profile = await getLandlordProfile();
  if (!profile) {
    redirect("/landlord/onboarding");
  }

  return (
    <>
      <h1 className="text-2xl">Your profile</h1>
      <div className="mt-4">
        <KycBanner status={profile.kycStatus} />
      </div>
      <div className="mt-6">
        <LandlordProfileForm profile={profile} />
      </div>
    </>
  );
}
