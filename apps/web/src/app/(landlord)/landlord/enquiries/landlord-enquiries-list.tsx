"use client";

import { useState } from "react";
import Link from "next/link";

import type { Inquiry } from "@campushomes/shared";

import { api, apiErrorMessage } from "@/lib/api";
import { Button } from "@/components/ui/button";

const CATEGORY_LABELS: Record<string, string> = {
  general: "General",
  listing: "Listing",
  reservation: "Reservation",
  payment: "Payment",
  safety: "Safety",
  other: "Other",
};

export function LandlordEnquiriesList({ initialInquiries }: { initialInquiries: Inquiry[] }) {
  const [rows, setRows] = useState<Inquiry[]>(initialInquiries);

  return (
    <ul className="mt-6 space-y-3">
      {rows.map((row) => (
        <EnquiryRow
          key={row.id}
          inquiry={row}
          onResponded={(updated) =>
            setRows((current) => current.map((r) => (r.id === updated.id ? updated : r)))
          }
        />
      ))}
    </ul>
  );
}

function EnquiryRow({
  inquiry,
  onResponded,
}: {
  inquiry: Inquiry;
  onResponded: (updated: Inquiry) => void;
}) {
  const [response, setResponse] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!response.trim()) return;
    setPending(true);
    setError(null);
    try {
      const updated = await api<Inquiry>(`/inquiries/${inquiry.id}/respond`, {
        method: "PATCH",
        body: JSON.stringify({ response: response.trim() }),
      });
      if (updated) onResponded(updated);
      setResponse("");
    } catch (err) {
      setError(apiErrorMessage(err, "Couldn't send your reply — try again."));
    } finally {
      setPending(false);
    }
  }

  return (
    <li className="rounded-lg border border-border p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="font-semibold">{inquiry.subject}</p>
        {inquiry.landlordRespondedAt ? (
          <span className="rounded-full bg-teal-100 px-2.5 py-0.5 text-xs font-bold text-teal-900 dark:bg-teal-950 dark:text-teal-100">
            Replied
          </span>
        ) : (
          <span className="rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-bold text-amber-900 dark:bg-amber-950 dark:text-amber-100">
            Awaiting reply
          </span>
        )}
      </div>
      <p className="mt-1 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
        {CATEGORY_LABELS[inquiry.category] ?? inquiry.category} ·{" "}
        {new Date(inquiry.createdAt).toLocaleDateString(undefined, {
          day: "numeric",
          month: "short",
          year: "numeric",
        })}
        {inquiry.listingId && (
          <>
            {" · "}
            <Link href={`/listings/${inquiry.listingId}`} className="normal-case underline">
              View listing
            </Link>
          </>
        )}
      </p>
      <p className="mt-2 whitespace-pre-line text-sm text-muted-foreground">{inquiry.message}</p>
      <p className="mt-1 text-xs text-muted-foreground">
        From {inquiry.studentName ?? "a student"}
        {inquiry.studentPhone ? ` · ${inquiry.studentPhone}` : ""}
      </p>

      {inquiry.landlordResponse ? (
        <div className="mt-3 rounded-lg bg-muted p-3 text-sm">
          <p className="font-semibold">Your reply</p>
          <p className="mt-1 whitespace-pre-line text-muted-foreground">{inquiry.landlordResponse}</p>
        </div>
      ) : (
        <form onSubmit={submit} className="mt-3 space-y-2">
          <textarea
            rows={3}
            maxLength={2000}
            value={response}
            onChange={(e) => setResponse(e.target.value)}
            placeholder="Write a reply — e.g. availability, viewing times, or an answer to their question."
            className="w-full rounded-lg border border-input bg-background p-3 text-sm"
            required
          />
          {error && <p className="text-sm font-semibold text-destructive">{error}</p>}
          <Button type="submit" size="sm" disabled={pending || !response.trim()}>
            {pending ? "Sending…" : "Send reply"}
          </Button>
        </form>
      )}
    </li>
  );
}
