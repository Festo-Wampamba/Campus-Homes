"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { api } from "@/lib/api";

export function ApproveVisitButton({ visitId }: { visitId: string }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);

  async function approve() {
    setPending(true);
    try {
      await api(`/ops/visits/${visitId}/approve`, { method: "POST" });
      router.refresh();
    } finally {
      setPending(false);
    }
  }

  return (
    <Button type="button" disabled={pending} onClick={approve}>
      {pending ? "Approving…" : "Approve"}
    </Button>
  );
}
