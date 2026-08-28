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

/** Sends the landlord a set-password email instead of requiring an
 * in-person concierge visit — the self-serve path for owners too far to
 * visit easily. Marks the lead converted on success. */
export function InviteLandlordAction({
  leadId,
  name,
  phone,
  email,
}: {
  leadId: string;
  name: string;
  phone: string;
  email: string | null;
}) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  async function invite() {
    setError(null);
    setPending(true);
    try {
      await api("/ops/landlords/invite", {
        method: "POST",
        body: JSON.stringify({ name, phone, email, leadId }),
      });
      setSent(true);
      router.refresh();
    } catch (err) {
      setError(errorMessage(err, "Couldn't send the invite — try again."));
    } finally {
      setPending(false);
    }
  }

  if (!email) {
    return <p className="text-xs text-muted-foreground">No email on this lead — can&apos;t send an invite.</p>;
  }

  if (sent) {
    return <p className="text-xs font-semibold text-success">Invite sent to {email}</p>;
  }

  return (
    <div className="space-y-1">
      <Button type="button" size="sm" variant="secondary" disabled={pending} onClick={() => void invite()}>
        {pending ? "Sending…" : "Invite to self-register"}
      </Button>
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}
