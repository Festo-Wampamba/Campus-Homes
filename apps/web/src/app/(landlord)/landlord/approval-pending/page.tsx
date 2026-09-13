import type { Metadata } from "next";
import { Clock3, ShieldAlert } from "lucide-react";
import { redirect } from "next/navigation";

import { Card, CardContent } from "@/components/ui/card";
import { getLandlordProfile } from "@/lib/landlord";

export const metadata: Metadata = { title: "Landlord application review" };

export default async function LandlordApprovalPendingPage() {
  const profile = await getLandlordProfile();
  if (!profile) redirect("/landlord/onboarding");
  if (profile.kycStatus === "verified") redirect("/landlord");

  const rejected = profile.kycStatus === "rejected";
  return (
    <div className="mx-auto flex max-w-xl justify-center py-10 sm:py-16">
      <Card className="w-full shadow-sm">
        <CardContent className="flex flex-col items-center gap-5 p-7 text-center sm:p-10">
          <span className={rejected
            ? "flex size-14 items-center justify-center rounded-full bg-destructive/10 text-destructive"
            : "flex size-14 items-center justify-center rounded-full bg-amber-500/10 text-amber-700"}
          >
            {rejected ? <ShieldAlert aria-hidden className="size-7" /> : <Clock3 aria-hidden className="size-7" />}
          </span>
          <div>
            <h1 className="font-display text-xl font-bold text-foreground">
              {rejected ? "Your landlord application was not approved" : "Your landlord application is under review"}
            </h1>
            <p className="mt-3 text-sm leading-6 text-muted-foreground">
              {rejected
                ? "CampusHomes has not granted landlord access for this application. Your dashboard, bookings, messages, and property tools will stay unavailable until the decision is reviewed. Please contact support if you need help."
                : "Thank you — your profile and property submission have been received. A CampusHomes administrator is reviewing them now. You will receive landlord dashboard access only after approval; until then, your listing is not visible to students."}
            </p>
          </div>
          {!rejected && <p className="rounded-lg bg-amber-50 px-4 py-3 text-sm font-semibold text-amber-900 dark:bg-amber-950/30 dark:text-amber-200">Status: pending review</p>}
        </CardContent>
      </Card>
    </div>
  );
}
