"use client";

import { useState } from "react";
import { Building2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { api, apiErrorMessage } from "@/lib/api";

export function EnrollLandlord() {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function enroll() {
    setPending(true);
    setError(null);
    try {
      const result = await api<{ onboardingPath: string }>("/landlords/enroll", { method: "POST" });
      window.location.assign(result.onboardingPath);
    } catch (reason) {
      setError(apiErrorMessage(reason, "We couldn't add landlord access. Please try again."));
      setPending(false);
    }
  }

  return (
    <div className="space-y-5">
      <div className="rounded-xl border border-border bg-muted/40 p-4 text-sm leading-6 text-muted-foreground">
        <Building2 aria-hidden className="mb-3 size-5 text-primary" />
        This adds a landlord workspace to your existing account. It does not remove student or other access.
        Properties still require CampusHomes verification before publication.
      </div>
      {error && <p role="alert" className="text-sm font-semibold text-destructive">{error}</p>}
      <Button type="button" size="lg" className="w-full" disabled={pending} onClick={enroll}>
        {pending ? "Adding landlord access…" : "Continue as a landlord"}
      </Button>
    </div>
  );
}
