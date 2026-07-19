import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { getLandlordProfile, getMyProperties } from "@/lib/landlord";
import { KycBanner } from "@/components/kyc-banner";
import { PropertiesManager } from "./properties-manager";

export const metadata: Metadata = { title: "Landlord dashboard" };

export default async function LandlordDashboardPage() {
  const [profile, properties] = await Promise.all([getLandlordProfile(), getMyProperties()]);

  if (!profile || properties.length === 0) {
    redirect("/landlord/onboarding");
  }

  return (
    <>
      <KycBanner status={profile.kycStatus} />
      <div className="mt-6">
        <PropertiesManager properties={properties} />
      </div>
    </>
  );
}
