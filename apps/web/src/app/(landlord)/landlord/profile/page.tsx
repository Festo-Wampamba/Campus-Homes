import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { getLandlordProfile, getMyProperties } from "@/lib/landlord";
import { ONBOARDING_PATH } from "@/lib/landlord-gate";
import { apiServer } from "@/lib/server-api";
import { LandlordAccountSettings } from "./landlord-profile-form";

export const metadata: Metadata = { title: "Account settings" };

export default async function LandlordProfilePage() {
  const [profile, properties, particulars] = await Promise.all([
    getLandlordProfile(),
    getMyProperties(),
    apiServer<{ email: string | null }>("/me/particulars"),
  ]);
  if (!profile) redirect(ONBOARDING_PATH);

  return (
    <>
      <h1 className="text-2xl">Account settings</h1>
      <div className="mt-6">
        <LandlordAccountSettings
          profile={profile}
          hasLiveListing={properties.some((p) => p.hasLiveListing)}
          email={particulars?.email ?? null}
        />
      </div>
    </>
  );
}
