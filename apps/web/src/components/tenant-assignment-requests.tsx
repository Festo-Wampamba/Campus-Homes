"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { TenantAssignmentRequest } from "@campushomes/shared";
import { Button } from "@/components/ui/button";
import { api, apiErrorMessage } from "@/lib/api";
import { formatUgx } from "@/lib/format";

export function TenantAssignmentRequests({ requests }: { requests: TenantAssignmentRequest[] }) {
  const router = useRouter();
  const [completed, setCompleted] = useState<string[]>([]);
  const [pending, setPending] = useState<string | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [message, setMessage] = useState("");
  async function respond(id: string, accept: boolean) {
    setPending(id); setMessage("");
    setErrors((current) => { const next = { ...current }; delete next[id]; return next; });
    try {
      await api(`/reservations/assignment-requests/${id}/${accept ? "accept" : "decline"}`, { method: "POST" });
      setCompleted((items) => [...items, id]);
      setMessage(accept ? "Room accepted. Your booking appears below." : "Room request declined. No booking was made.");
      router.refresh();
    } catch (caught) { setErrors((current) => ({ ...current, [id]: apiErrorMessage(caught, "Could not update this request. Try again.") })); }
    finally { setPending(null); }
  }
  const visible = requests.filter((request) => !completed.includes(request.id));
  if (!visible.length && !message) return null;
  return <section aria-label="Room assignments" className="mt-6 space-y-4">
    {visible.length > 0 && <h2 className="text-xl">Rooms offered by your landlord</h2>}
    {message && <p role="status" className="rounded-lg border border-border p-4 text-sm">{message}</p>}
    {visible.map((request) => <article key={request.id} className="rounded-lg border border-border bg-card p-4">
      <h3 className="font-semibold">{request.propertyName} · {request.roomLabel} · {request.bedLabel}</h3>
      <p className="mt-2 text-sm">Semester rent: {formatUgx(request.pricePerTermUgx)}. Payment reported by landlord: {formatUgx(request.amountPaidUgx)}.</p>
      <p className="mt-2 text-sm text-muted-foreground">{request.movedIn ? "The landlord says you already live in this room. Accept only if that is correct." : "Accept to book this bed to your account."} Availability is checked when you accept. Expires {new Date(request.expiresAt).toLocaleDateString("en-UG")}.</p>
      <div className="mt-4 flex flex-wrap gap-3">
        <Button type="button" className="min-h-11" disabled={pending !== null} onClick={() => respond(request.id, true)}>{pending === request.id ? "Updating…" : "Accept room"}</Button>
        <Button type="button" variant="secondary" className="min-h-11" disabled={pending !== null} onClick={() => respond(request.id, false)}>Decline</Button>
      </div>
      {errors[request.id] && <p role="alert" className="mt-3 text-sm text-destructive">{errors[request.id]}</p>}
    </article>)}
  </section>;
}
