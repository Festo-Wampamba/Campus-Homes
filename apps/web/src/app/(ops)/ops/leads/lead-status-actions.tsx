"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { OnboardingLeadStatus } from "@campushomes/shared";

import { Button } from "@/components/ui/button";
import { api } from "@/lib/api";

export function LeadStatusActions({ leadId, status }: { leadId: string; status: OnboardingLeadStatus }) {
  const router = useRouter();
  const [pending, setPending] = useState<OnboardingLeadStatus | null>(null);

  async function setStatus(next: OnboardingLeadStatus) {
    setPending(next);
    try {
      await api(`/ops/leads/${leadId}`, { method: "PATCH", body: JSON.stringify({ status: next }) });
      router.refresh();
    } finally {
      setPending(null);
    }
  }

  return (
    <div className="flex flex-wrap gap-2">
      {status === "new" && (
        <Button type="button" size="sm" disabled={pending !== null} onClick={() => setStatus("contacted")}>
          {pending === "contacted" ? "Marking…" : "Mark contacted"}
        </Button>
      )}
      {status !== "converted" && (
        <Button
          type="button"
          size="sm"
          variant="secondary"
          disabled={pending !== null}
          onClick={() => setStatus("converted")}
        >
          {pending === "converted" ? "Marking…" : "Mark converted"}
        </Button>
      )}
      {status !== "dismissed" && (
        <Button
          type="button"
          size="sm"
          variant="ghost"
          disabled={pending !== null}
          onClick={() => setStatus("dismissed")}
        >
          {pending === "dismissed" ? "Dismissing…" : "Dismiss"}
        </Button>
      )}
    </div>
  );
}
