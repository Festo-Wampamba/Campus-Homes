"use client";

import { useState } from "react";

import { Button } from "@/components/ui/button";
import { api, ApiError } from "@/lib/api";

const PAYMENTS_ENABLED = process.env.NEXT_PUBLIC_PAYMENTS_ENABLED === "true";

function errorMessage(err: unknown, fallback: string): string {
  if (err instanceof ApiError) {
    const body = err.body as { message?: string | string[] } | null;
    if (typeof body?.message === "string") return body.message;
    if (Array.isArray(body?.message)) return body.message.join(", ");
  }
  return fallback;
}

export function ReserveButton({ unitId }: { unitId: string }) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!PAYMENTS_ENABLED) return null;

  async function reserve() {
    setError(null);
    setPending(true);
    try {
      const { checkoutUrl } = await api<{ checkoutUrl: string }>("/reservations/holds", {
        method: "POST",
        body: JSON.stringify({ unitId, idempotencyKey: crypto.randomUUID() }),
      });
      window.location.href = checkoutUrl;
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
