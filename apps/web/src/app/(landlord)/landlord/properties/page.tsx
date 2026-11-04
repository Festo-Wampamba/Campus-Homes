import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { getLandlordProfile, getMyProperties } from "@/lib/landlord";
import { KycBanner } from "@/components/kyc-banner";
import { PropertiesManager } from "./properties-manager";

export const metadata: Metadata = { title: "My Properties" };

export default async function LandlordPropertiesPage() {
  const [profile, properties] = await Promise.all([getLandlordProfile(), getMyProperties()]);

  if (!profile || properties.length === 0) {
    redirect("/landlord/onboarding");
  }

  return (
    <>
      <KycBanner listingIntent={properties.length > 0 && properties.every((p) => p.listingIntent === "manage_only") ? "manage_only" : "list"} status={profile.kycStatus} hasLiveListing={properties.some((p) => p.hasLiveListing)} />
      <div className="mt-6">
        <PropertiesManager properties={properties} />
      </div>
    </>
  );
}
