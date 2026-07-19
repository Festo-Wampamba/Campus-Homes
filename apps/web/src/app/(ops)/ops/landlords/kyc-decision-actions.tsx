"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { api } from "@/lib/api";

export function KycDecisionActions({ userId }: { userId: string }) {
  const router = useRouter();
  const [pending, setPending] = useState<"verified" | "rejected" | null>(null);

  async function decide(decision: "verified" | "rejected") {
    setPending(decision);
    try {
      await api(`/ops/landlords/${userId}/kyc`, {
        method: "POST",
        body: JSON.stringify({ decision }),
      });
      router.refresh();
    } finally {
      setPending(null);
    }
  }

  return (
    <div className="flex gap-2">
      <Button
        type="button"
        variant="secondary"
        disabled={pending !== null}
        onClick={() => decide("rejected")}
      >
        {pending === "rejected" ? "Rejecting…" : "Reject"}
      </Button>
      <Button type="button" disabled={pending !== null} onClick={() => decide("verified")}>
        {pending === "verified" ? "Verifying…" : "Verify"}
      </Button>
    </div>
  );
}
