"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { api, ApiError } from "@/lib/api";

function errorMessage(err: unknown, fallback: string): string {
  if (err instanceof ApiError) {
    const body = err.body as { message?: string | string[] } | null;
    if (typeof body?.message === "string") return body.message;
    if (Array.isArray(body?.message)) return body.message.join(", ");
  }
  return fallback;
}

export function ReserveButton({ unitId }: { unitId: string }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function reserve() {
    setError(null);
    setPending(true);
    try {
      // checkoutUrl is only set on the paid path (RESERVATION_FEE_UGX > 0
      // via platform_settings) — the Phase 1 default is a free reservation,
      // already 'fulfilled' by the time this call returns, nothing to pay.
      const { checkoutUrl } = await api<{ checkoutUrl: string | null }>("/reservations/holds", {
        method: "POST",
        body: JSON.stringify({ unitId, idempotencyKey: crypto.randomUUID() }),
      });
      if (checkoutUrl) {
        window.location.href = checkoutUrl;
        return;
      }
      router.push("/reservations");
    } catch (err) {
      setError(errorMessage(err, "Couldn't start your reservation — try again."));
      setPending(false);
    }
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <Button type="button" size="sm" disabled={pending} onClick={reserve}>
        {pending ? "Starting…" : "Reserve"}
      </Button>
      {error && (
        <p role="status" className="max-w-40 text-right text-xs text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}
