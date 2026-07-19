"use client";

import { useState } from "react";
import { useSearchParams } from "next/navigation";
import { ShieldAlert } from "lucide-react";

import { api } from "@/lib/api";
import { formatUgx } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

// Stands in for the real Flutterwave-hosted checkout page (payments.adapter.ts
// StubPayments) while no gateway account is configured — deliberately looks
// nothing like CampusHomes (no header/nav from any route group) so it reads
// as "you left the app and landed on a payment provider", same as the real
// flow would. "Paying" here calls the exact same webhook handler a real
// Flutterwave webhook would (POST /webhooks/dev-simulate → applyPaymentWebhook()).
export function StubCheckoutClient({ txRef }: { txRef: string }) {
  const searchParams = useSearchParams();
  const amount = Number(searchParams.get("amount") ?? 0);
  const redirect = searchParams.get("redirect") ?? "/";
  const [pending, setPending] = useState<"successful" | "failed" | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function resolve(outcome: "successful" | "failed") {
    setError(null);
    setPending(outcome);
    try {
      await api("/webhooks/dev-simulate", {
        method: "POST",
        body: JSON.stringify({ txRef, outcome }),
      });
      window.location.href = redirect;
    } catch {
      setError("Couldn't simulate that outcome — try again.");
      setPending(null);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-100 px-4">
      <Card className="w-full max-w-sm shadow-lg">
        <CardContent className="p-6 sm:p-8">
          <div className="mb-5 flex items-center gap-2 rounded-md bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-800">
            <ShieldAlert aria-hidden className="size-4 shrink-0" />
            Stub checkout — dev only, no real payment gateway is configured yet.
          </div>
          <p className="text-sm text-muted-foreground">Amount due</p>
          <p className="tabular font-display text-3xl font-bold text-foreground">
            {formatUgx(amount)}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">Ref: {txRef}</p>

          <div className="mt-6 space-y-2.5">
            <Button
              type="button"
              disabled={pending !== null}
              onClick={() => resolve("successful")}
              className="w-full"
            >
              {pending === "successful" ? "Processing…" : `Pay ${formatUgx(amount)} now`}
            </Button>
            <Button
              type="button"
              variant="secondary"
              disabled={pending !== null}
              onClick={() => resolve("failed")}
              className="w-full"
            >
              {pending === "failed" ? "Processing…" : "Simulate a failed payment"}
            </Button>
          </div>
          {error && <p className="mt-3 text-sm text-destructive">{error}</p>}
        </CardContent>
      </Card>
    </div>
  );
}
