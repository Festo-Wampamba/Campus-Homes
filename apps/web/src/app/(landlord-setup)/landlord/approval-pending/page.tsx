import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { getLandlordProfile } from "@/lib/landlord";
import { ONBOARDING_PATH } from "@/lib/landlord-gate";
import { ApprovalReview } from "./approval-review";

export const metadata: Metadata = { title: "Landlord application review" };

// The (landlord-setup) layout already redirects verified landlords and
// landlords without a submitted property; this only seeds the first render.
export default async function LandlordApprovalPendingPage() {
  const profile = await getLandlordProfile();
  if (!profile) redirect(ONBOARDING_PATH);
  return <ApprovalReview initialStatus={profile.kycStatus} />;
}
