import type { Property } from "@campushomes/shared";
import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { getLandlordProfile } from "@/lib/landlord";
import { ONBOARDING_PATH } from "@/lib/landlord-gate";
import { apiServer } from "@/lib/server-api";
import { LandlordAccountSettings } from "./landlord-profile-form";

export const metadata: Metadata = { title: "Account settings" };

export default async function LandlordProfilePage() {
  const [profile, properties, particulars] = await Promise.all([
    getLandlordProfile(),
    // apiServer, not getMyProperties(): a failed load must stay "unknown" (null)
    // rather than read as "no live listing".
    apiServer<Property[]>("/listings/properties/mine"),
    apiServer<{ email: string | null }>("/me/particulars"),
  ]);
  if (!profile) redirect(ONBOARDING_PATH);

  return (
    <>
      <h1 className="text-2xl">Account settings</h1>
      <div className="mt-6">
        <LandlordAccountSettings
          profile={profile}
          hasLiveListing={properties === null ? null : properties.some((p) => p.hasLiveListing)}
          email={particulars?.email ?? null}
        />
      </div>
    </>
  );
}
