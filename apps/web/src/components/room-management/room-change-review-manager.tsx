"use client";

import type { RoomChangeActivityItem, RoomChangeReviewItem } from "@campushomes/shared";
import { AlertTriangle, Check, ClipboardCheck, Loader2, X } from "lucide-react";
import Link from "next/link";
import { useState } from "react";

import { Button } from "../ui/button";
import { api, apiErrorMessage } from "../../lib/api";

const ugx = new Intl.NumberFormat("en-UG", { style: "currency", currency: "UGX", maximumFractionDigits: 0 });
const date = (value: string) => new Date(value).toLocaleString("en-UG", { timeZone: "Africa/Kampala", dateStyle: "medium", timeStyle: "short" });
type Change = { label: string; before: string; after: string };

function Changes({ rows }: { rows: Change[] }) {
  return <div className="mt-3 max-h-96 overflow-y-auto overscroll-contain" tabIndex={0} role="region" aria-label="Change details">
    <div className="hidden grid-cols-[1fr_1fr_1fr] gap-4 border-b border-border bg-muted px-4 py-2 text-xs font-semibold text-muted-foreground sm:grid" aria-hidden>
      <span>Changed item</span><span>Before</span><span>After</span>
    </div>
    <ul className="divide-y divide-border">
      {rows.map((row, index) => <li key={index} className="grid gap-2 px-4 py-3 text-sm sm:grid-cols-[1fr_1fr_1fr] sm:gap-4">
        <span className="min-w-0 break-words font-semibold">{row.label}</span>
        <span className="min-w-0 whitespace-pre-wrap break-words text-muted-foreground"><span className="mr-2 font-semibold sm:sr-only">Before:</span>{row.before}</span>
        <span className="min-w-0 whitespace-pre-wrap break-words"><span className="mr-2 font-semibold sm:sr-only">After:</span>{row.after}</span>
      </li>)}
    </ul>
  </div>;
}

function reviewChanges(item: RoomChangeReviewItem): Change[] {
  const spec = (type: RoomChangeReviewItem["roomTypeChanges"][number]["after"]) => `${type.title} · ${type.category} · ${type.capacity} ${type.capacity === 1 ? "bed" : "beds"} · ${ugx.format(type.pricePerTermUgx)}`;
  const room = (value: RoomChangeReviewItem["physicalRoomChanges"][number]["after"]) => value
    ? [value.roomCode, value.buildingName, value.floorLabel, `${value.capacity} ${value.capacity === 1 ? "bed" : "beds"}`].filter(Boolean).join(" · ") : "Archived";
  return [
    ...item.roomTypeChanges.map((change) => ({ label: `Room type · ${change.after.title}`, before: change.before ? spec(change.before) : "New room type", after: spec(change.after) })),
    ...item.physicalRoomChanges.map((change) => ({ label: `${change.action === "create" ? "Add" : change.action === "archive" ? "Archive" : "Update"} room · ${change.after?.roomCode ?? change.before?.roomCode}`, before: change.before ? room(change.before) : "New room", after: room(change.after) })),
  ];
}

export function RoomChangeReviewManager({ initialItems, initialActivity = [], canScheduleVisit = false }: {
  initialItems: RoomChangeReviewItem[];
  initialActivity?: RoomChangeActivityItem[];
  canScheduleVisit?: boolean;
}) {
  const [items, setItems] = useState(initialItems);
  const [view, setView] = useState<"review" | "activity">(initialItems.length || !initialActivity.length ? "review" : "activity");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [decision, setDecision] = useState<{ item: RoomChangeReviewItem; action: "approve" | "reject" } | null>(null);
  const [notes, setNotes] = useState("");
  const [error, setError] = useState<string | null>(null);

  async function submitDecision(event: React.FormEvent) {
    event.preventDefault();
    if (!decision) return;
    const { item, action } = decision;
    if (action === "reject" && notes.trim().length < 3) {
      setError("Explain what the landlord must correct using at least 3 characters."); return;
    }
    setBusyId(item.id); setError(null);
    try {
      await api(`/ops/room-change-requests/${item.id}/${action}`, { method: "POST",
        body: JSON.stringify(action === "approve" ? { notes: notes.trim() || null } : { reason: notes.trim() }) });
      setItems((current) => current.filter((entry) => entry.id !== item.id));
      setDecision(null); setNotes("");
      window.dispatchEvent(new Event("campushomes:notifications-refresh"));
    } catch (cause) { setError(apiErrorMessage(cause, `Could not ${action} these room changes`)); }
    finally { setBusyId(null); }
  }

  const beginDecision = (item: RoomChangeReviewItem, action: "approve" | "reject") => { setDecision({ item, action }); setNotes(""); setError(null); };

  return <div className="mt-6 min-w-0 space-y-5">
    <div className="flex flex-wrap gap-2 border-b border-border pb-4" aria-label="Room change views">
      <Button variant={view === "review" ? "primary" : "secondary"} aria-pressed={view === "review"} onClick={() => setView("review")}>Needs review ({items.length})</Button>
      <Button variant={view === "activity" ? "primary" : "secondary"} aria-pressed={view === "activity"} onClick={() => setView("activity")}>Applied updates ({initialActivity.length})</Button>
    </div>
    {error && <p role="alert" className="rounded-lg border border-destructive p-4 text-sm text-destructive">{error}</p>}
    {view === "review" && !items.length && <div className="rounded-xl border border-border bg-card px-6 py-12 text-center">
      <ClipboardCheck aria-hidden className="mx-auto size-9 text-primary" />
      <h2 className="mt-3 text-lg font-semibold">No room changes need approval</h2>
      <p className="mx-auto mt-2 max-w-prose text-sm text-muted-foreground">First-time property submissions appear here when rooms are submitted. Updates to an already approved property save immediately and appear under Applied updates.</p>
    </div>}
    {view === "review" && items.map((item) => <article key={item.id} className="min-w-0 rounded-xl border border-border bg-card">
      <header className="space-y-3 p-4 sm:p-6">
        <div className="flex flex-wrap items-center gap-3">
          <h2 className="min-w-0 break-words text-lg font-semibold">{item.propertyName}</h2>
          <span className="rounded-md bg-muted px-3 py-1 text-sm font-semibold">{item.status === "visit_required" ? "Physical inspection required" : "Review required"}</span>
        </div>
        <p className="text-sm text-muted-foreground">{item.landlordName}{item.submittedAt ? ` · ${date(item.submittedAt)} EAT` : ""}</p>
        <p className="text-sm"><strong>{item.physicalRoomChangesCount}</strong> physical room changes <span className="mx-2 text-muted-foreground" aria-hidden>·</span> <strong>{item.roomTypeChangesCount}</strong> room type changes</p>
      </header>
      <details open className="border-t border-border pb-2">
        <summary className="cursor-pointer px-4 py-3 text-sm font-semibold focus-visible:outline-2 focus-visible:outline-ring sm:px-6">Before and after ({item.roomTypeChangesCount + item.physicalRoomChangesCount} changes)</summary>
        <Changes rows={reviewChanges(item)} />
      </details>
      <footer className="space-y-4 border-t border-border p-4 sm:p-6">
        {item.submissionNotes && <p className="whitespace-pre-wrap break-words text-sm">Landlord note: {item.submissionNotes}</p>}
        {item.status === "visit_required" && <p className="flex gap-2 text-sm"><AlertTriangle aria-hidden className="mt-0.5 size-4 shrink-0 text-warning" /><span>An approved physical inspection completed after this submission is required. The Ops lead can visit or assign an inspector.</span></p>}
        <div className="flex flex-wrap gap-3">
          {canScheduleVisit && item.status === "visit_required" && <Link href={`/ops/visits/schedule?propertyId=${encodeURIComponent(item.propertyId)}`} className="inline-flex min-h-11 items-center rounded-md border border-border px-4 py-2 text-sm font-semibold text-primary hover:bg-muted focus-visible:outline-2 focus-visible:outline-ring">Schedule inspection</Link>}
          <Button variant="secondary" disabled={busyId !== null} onClick={() => beginDecision(item, "reject")}><X aria-hidden />Return for correction</Button>
          <Button disabled={busyId !== null} onClick={() => beginDecision(item, "approve")}><Check aria-hidden />Approve changes</Button>
        </div>
        {decision?.item.id === item.id && <form onSubmit={(event) => void submitDecision(event)} className="space-y-3 border-t border-border pt-4">
          <label htmlFor={`review-note-${item.id}`} className="block text-sm font-semibold">{decision.action === "approve" ? "Approval note (optional)" : "What must the landlord correct?"}</label>
          <textarea id={`review-note-${item.id}`} value={notes} onChange={(event) => setNotes(event.target.value)} required={decision.action === "reject"} minLength={decision.action === "reject" ? 3 : undefined} maxLength={2000} disabled={busyId !== null} className="min-h-24 w-full rounded-md border border-border bg-background p-3 text-base focus-visible:outline-2 focus-visible:outline-ring" />
          <div className="flex flex-wrap gap-3"><Button type="submit" disabled={busyId !== null}>{busyId && <Loader2 aria-hidden className="animate-spin" />}Confirm {decision.action === "approve" ? "approval" : "return"}</Button><Button variant="secondary" type="button" disabled={busyId !== null} onClick={() => setDecision(null)}>Cancel</Button></div>
        </form>}
      </footer>
    </article>)}
    {view === "activity" && <>
      <p className="max-w-prose text-sm text-muted-foreground">Recent updates saved by landlords. These changes are already applied and need no further approval. Showing the latest 100 notices in your current property scope.</p>
      {!initialActivity.length && <p className="rounded-xl border border-border p-6 text-sm text-muted-foreground">No applied updates to show yet.</p>}
      {initialActivity.map((item) => <article key={item.id} className="min-w-0 rounded-xl border border-border bg-card p-4 sm:p-6">
        <div className="flex flex-wrap items-center justify-between gap-3"><h2 className="min-w-0 break-words text-lg font-semibold">{item.propertyName}</h2><span className="flex items-center gap-2 text-sm font-semibold text-primary"><Check aria-hidden className="size-4" />Saved · no approval needed</span></div>
        <p className="mt-2 text-sm text-muted-foreground">{item.landlordName} · {date(item.createdAt)} EAT</p>
        <p className="mt-3 break-words text-sm">{item.message}</p>
        {!!item.changes?.length && <details className="mt-4 border-t border-border pt-3"><summary className="cursor-pointer text-sm font-semibold focus-visible:outline-2 focus-visible:outline-ring">What changed ({item.changes.length})</summary><Changes rows={item.changes} /></details>}
      </article>)}
    </>}
  </div>;
}
