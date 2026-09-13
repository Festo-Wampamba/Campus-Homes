"use client";

import type { RoomChangeReviewItem } from "@campushomes/shared";
import { AlertTriangle, Check, ClipboardCheck, Loader2, X } from "lucide-react";
import Link from "next/link";
import { useState } from "react";

import { api, apiErrorMessage } from "@/lib/api";

const ugx = new Intl.NumberFormat("en-UG", { style: "currency", currency: "UGX", maximumFractionDigits: 0 });

export function RoomChangeReviewManager({
  initialItems,
  canScheduleVisit = false,
}: {
  initialItems: RoomChangeReviewItem[];
  canScheduleVisit?: boolean;
}) {
  const [items, setItems] = useState(initialItems);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function decide(item: RoomChangeReviewItem, decision: "approve" | "reject") {
    const promptText = decision === "approve"
      ? "Optional reviewer note"
      : "Explain exactly what the landlord must correct";
    const notes = window.prompt(promptText, "");
    if (notes === null) return;
    if (decision === "reject" && notes.trim().length < 3) {
      setError("A rejection must include a clear reason of at least 3 characters.");
      return;
    }

    setBusyId(item.id);
    setError(null);
    try {
      await api(`/ops/room-change-requests/${item.id}/${decision}`, {
        method: "POST",
        body: JSON.stringify(decision === "approve" ? { notes: notes.trim() || null } : { reason: notes.trim() }),
      });
      setItems((current) => current.filter((entry) => entry.id !== item.id));
      window.dispatchEvent(new Event("campushomes:notifications-refresh"));
    } catch (cause) {
      setError(apiErrorMessage(cause, `Could not ${decision} these room changes`));
    } finally {
      setBusyId(null);
    }
  }

  if (!items.length) {
    return (
      <div className="mt-6 rounded-xl border border-border bg-card px-6 py-14 text-center">
        <ClipboardCheck aria-hidden className="mx-auto size-9 text-teal-600" />
        <h2 className="mt-3 text-lg font-semibold">Room-change queue is clear</h2>
        <p className="mt-1 text-sm text-muted-foreground">New landlord submissions will appear here for review.</p>
      </div>
    );
  }

  return (
    <div className="mt-6 space-y-4">
      {error && <div role="alert" className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}
      {items.map((item) => {
        const busy = busyId === item.id;
        return (
          <article key={item.id} className="rounded-xl border border-border bg-card p-5 shadow-sm">
            <div className="flex flex-col justify-between gap-4 md:flex-row md:items-start">
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="text-lg font-semibold">{item.propertyName}</h2>
                  <span className={item.status === "visit_required"
                    ? "rounded-full bg-amber-100 px-2.5 py-1 text-xs font-semibold text-amber-800"
                    : "rounded-full bg-blue-100 px-2.5 py-1 text-xs font-semibold text-blue-800"}
                  >
                    {item.status === "visit_required" ? "Physical verification required" : "Review required"}
                  </span>
                </div>
                <p className="mt-1 text-sm text-muted-foreground">Submitted by {item.landlordName}{item.submittedAt ? ` · ${new Date(item.submittedAt).toLocaleString()}` : ""}</p>
                <dl className="mt-4 grid grid-cols-2 gap-3 text-sm sm:grid-cols-3">
                  <div><dt className="text-muted-foreground">Room types</dt><dd className="font-semibold">{item.roomTypeChangesCount}</dd></div>
                  <div><dt className="text-muted-foreground">Physical rooms</dt><dd className="font-semibold">{item.physicalRoomChangesCount}</dd></div>
                  <div><dt className="text-muted-foreground">Total changes</dt><dd className="font-semibold">{item.roomTypeChangesCount + item.physicalRoomChangesCount}</dd></div>
                </dl>
                {(item.roomTypeChanges.length > 0 || item.physicalRoomChanges.length > 0) && (
                  <div className="mt-4 grid gap-3 lg:grid-cols-2">
                    {item.roomTypeChanges.length > 0 && (
                      <section className="rounded-lg border border-border p-3">
                        <h3 className="text-sm font-semibold">Room type changes</h3>
                        <ul className="mt-2 space-y-2 text-xs">
                          {item.roomTypeChanges.map((change) => (
                            <li key={change.id} className="rounded-md bg-muted/50 p-2">
                              <strong>{change.after.title}</strong>
                              <p className="mt-1 text-muted-foreground">
                                {change.before
                                  ? `${change.before.capacity} beds · ${ugx.format(change.before.pricePerTermUgx)} → `
                                  : "New type → "}
                                {change.after.capacity} beds · {ugx.format(change.after.pricePerTermUgx)}
                              </p>
                            </li>
                          ))}
                        </ul>
                      </section>
                    )}
                    {item.physicalRoomChanges.length > 0 && (
                      <section className="rounded-lg border border-border p-3">
                        <h3 className="text-sm font-semibold">Physical room changes</h3>
                        <ul className="mt-2 space-y-2 text-xs">
                          {item.physicalRoomChanges.map((change) => (
                            <li key={change.id} className="rounded-md bg-muted/50 p-2">
                              <strong className="capitalize">{change.action.replace("_", " ")}</strong>
                              <p className="mt-1 text-muted-foreground">
                                {change.before ? `${change.before.roomCode} (${change.before.capacity} beds)` : "New room"}
                                {change.after ? ` → ${change.after.roomCode} (${change.after.capacity} beds)` : " → archived"}
                              </p>
                            </li>
                          ))}
                        </ul>
                      </section>
                    )}
                  </div>
                )}
                {item.submissionNotes && <p className="mt-4 rounded-lg bg-muted px-3 py-2 text-sm">{item.submissionNotes}</p>}
                {item.status === "visit_required" && (
                  <p className="mt-4 flex gap-2 text-sm text-amber-800">
                    <AlertTriangle aria-hidden className="mt-0.5 size-4 shrink-0" />
                    Confirm the physical room or capacity change has been inspected before approval.
                  </p>
                )}
              </div>
              <div className="flex shrink-0 gap-2">
                {canScheduleVisit && item.status === "visit_required" && (
                  <Link
                    href={`/ops/visits/schedule?propertyId=${encodeURIComponent(item.propertyId)}`}
                    className="inline-flex min-h-10 items-center rounded-lg border border-amber-300 px-4 text-sm font-semibold text-amber-800 hover:bg-amber-50"
                  >
                    Schedule visit
                  </Link>
                )}
                <button type="button" disabled={busyId !== null} onClick={() => void decide(item, "reject")} className="inline-flex min-h-10 items-center gap-2 rounded-lg border border-red-200 px-4 text-sm font-semibold text-red-700 hover:bg-red-50 disabled:opacity-50">
                  {busy ? <Loader2 aria-hidden className="size-4 animate-spin" /> : <X aria-hidden className="size-4" />} Reject
                </button>
                <button type="button" disabled={busyId !== null} onClick={() => void decide(item, "approve")} className="inline-flex min-h-10 items-center gap-2 rounded-lg bg-teal-600 px-4 text-sm font-semibold text-white hover:bg-teal-700 disabled:opacity-50">
                  {busy ? <Loader2 aria-hidden className="size-4 animate-spin" /> : <Check aria-hidden className="size-4" />} Approve
                </button>
              </div>
            </div>
          </article>
        );
      })}
    </div>
  );
}
