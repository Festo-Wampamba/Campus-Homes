import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Building2, Clock, ShieldAlert, ShieldCheck } from "lucide-react";

import { getLandlordProfile, getMyProperties } from "@/lib/landlord";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Landlord dashboard" };

const PROPERTY_STATUS_LABEL: Record<string, string> = {
  pending_kyc: "Awaiting verification",
  active: "Active",
  suspended: "Suspended",
};

function KycBanner({ status }: { status: "pending" | "verified" | "rejected" }) {
  if (status === "verified") {
    return (
      <div className="flex items-center gap-3 rounded-lg border border-primary/30 bg-accent px-4 py-3 text-sm font-semibold text-teal-700">
        <ShieldCheck aria-hidden className="size-5 shrink-0" />
        Your account is verified — students can now reserve units in your listings.
      </div>
    );
  }
  if (status === "rejected") {
    return (
      <div className="flex items-center gap-3 rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm font-semibold text-destructive">
        <ShieldAlert aria-hidden className="size-5 shrink-0" />
        Your KYC review was rejected. Contact support to resubmit your ID document.
      </div>
    );
  }
  return (
    <div className="flex items-center gap-3 rounded-lg border border-warning/30 bg-warning-subtle px-4 py-3 text-sm font-semibold text-warning">
      <Clock aria-hidden className="size-5 shrink-0" />
      Your KYC review is in progress. Our team verifies new landlords before listings go live.
    </div>
  );
}

export default async function LandlordDashboardPage() {
  const [profile, properties] = await Promise.all([getLandlordProfile(), getMyProperties()]);

  if (!profile || properties.length === 0) {
    redirect("/landlord/onboarding");
  }

  return (
    <>
      <h1 className="text-2xl">Your properties</h1>
      <div className="mt-4">
        <KycBanner status={profile.kycStatus} />
      </div>
      <div className="mt-6 grid gap-4 sm:grid-cols-2">
        {properties.map((property) => (
          <Card key={property.id}>
            <CardContent className="flex items-start gap-3 p-5">
              <span className="flex size-10 shrink-0 items-center justify-center rounded-md bg-teal-50 text-teal-700">
                <Building2 aria-hidden className="size-5" />
              </span>
              <div>
                <h2 className="font-display text-sm font-semibold text-foreground">
                  {property.name}
                </h2>
                <p className="text-sm text-muted-foreground">{property.streetAddress}</p>
                <span
                  className={cn(
                    "mt-2 inline-block rounded-full px-2.5 py-0.5 text-xs font-semibold",
                    property.status === "active"
                      ? "bg-accent text-teal-700"
                      : property.status === "suspended"
                        ? "bg-destructive/10 text-destructive"
                        : "bg-warning-subtle text-warning",
                  )}
                >
                  {PROPERTY_STATUS_LABEL[property.status] ?? property.status}
                </span>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </>
  );
}
