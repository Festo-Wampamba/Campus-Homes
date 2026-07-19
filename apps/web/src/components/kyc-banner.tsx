import { Clock, ShieldAlert, ShieldCheck } from "lucide-react";

export function KycBanner({ status }: { status: "pending" | "verified" | "rejected" }) {
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
