"use client";

import type { ProposedRoomCategory } from "@campushomes/shared";
import { Building2, Check, Loader2, MapPin, X } from "lucide-react";
import { useState } from "react";

import { api, apiErrorMessage } from "@/lib/api";
import { roomCategoryLabel } from "@/lib/format";

export type ManagedPropertyItem = {
  id: string;
  name: string;
  streetAddress: string;
  locationDetails: string | null;
  catchment: string;
  createdAt: string;
  reviewStatus: "pending" | "rejected";
  rejectionReason: string | null;
  proposedRoomCategories: ProposedRoomCategory[] | null;
  landlordName: string | null;
  landlordPhone: string | null;
  landlordEmail: string | null;
  landlordKycStatus: string;
};

const ugx = new Intl.NumberFormat("en-UG", { style: "currency", currency: "UGX", maximumFractionDigits: 0 });

export function ManagedPropertyReview({ initialItems, canDecide }: { initialItems: ManagedPropertyItem[]; canDecide: boolean }) {
  const [items, setItems] = useState(initialItems);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  async function decide(item: ManagedPropertyItem, decision: "approve" | "reject") {
    let reason: string | null = null;
    if (decision === "reject") {
      reason = window.prompt("What must the landlord fix before you can approve?", "")?.trim() ?? null;
      if (reason === null) return;
      if (reason.length < 3) {
        setError("Give the landlord a reason of at least 3 characters.");
        return;
      }
    }
    setBusyId(item.id);
    setError(null);
    setNotice(null);
    try {
      const result = await api<{ roomsCreated?: number }>(`/ops/managed-properties/${item.id}/${decision}`, {
        method: "POST",
        body: reason === null ? undefined : JSON.stringify({ reason }),
      });
      if (decision === "approve") {
        setItems((current) => current.filter((entry) => entry.id !== item.id));
        setNotice(`${item.name} approved.${result.roomsCreated ? ` ${result.roomsCreated} rooms were set up from the landlord's room types.` : ""}`);
      } else {
        setItems((current) => current.map((entry) => entry.id === item.id
          ? { ...entry, reviewStatus: "rejected", rejectionReason: reason }
          : entry));
      }
      window.dispatchEvent(new Event("campushomes:notifications-refresh"));
    } catch (cause) {
      setError(apiErrorMessage(cause, `Could not ${decision} this property`));
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="mt-6 space-y-4">
      {error && <div role="alert" className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}
      {notice && <div role="status" className="rounded-lg border border-teal-200 bg-teal-50 px-4 py-3 text-sm text-teal-800">{notice}</div>}
      {items.length === 0 && (
        <div className="rounded-xl border border-border bg-card px-6 py-14 text-center">
          <Building2 aria-hidden className="mx-auto size-9 text-teal-600" />
          <h2 className="mt-3 text-lg font-semibold">Nothing waiting</h2>
          <p className="mt-1 text-sm text-muted-foreground">New managed properties appear here, and you get a notification and an email.</p>
        </div>
      )}
      {items.map((item) => {
        const busy = busyId === item.id;
        const declared = item.proposedRoomCategories ?? [];
        const totalRooms = declared.reduce((sum, row) => sum + row.roomCount, 0);
        const address = [item.streetAddress, item.locationDetails].filter(Boolean).join(", ");
        return (
          <article key={item.id} className="rounded-xl border border-border bg-card p-5 shadow-sm">
            <div className="flex flex-col justify-between gap-4 md:flex-row md:items-start">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="text-lg font-semibold">{item.name}</h2>
                  <span className={item.reviewStatus === "rejected"
                    ? "rounded-full bg-red-100 px-2.5 py-1 text-xs font-semibold text-red-800"
                    : "rounded-full bg-blue-100 px-2.5 py-1 text-xs font-semibold text-blue-800"}
                  >
                    {item.reviewStatus === "rejected" ? "Sent back" : "Waiting for approval"}
                  </span>
                  {item.landlordKycStatus !== "verified" && (
                    <span className="rounded-full bg-amber-100 px-2.5 py-1 text-xs font-semibold text-amber-800">Identity not yet reviewed</span>
                  )}
                </div>
                <p className="mt-1 text-sm text-muted-foreground">
                  {item.landlordName ?? "Landlord"}
                  {item.landlordPhone ? ` · ${item.landlordPhone}` : ""}
                  {item.landlordEmail ? ` · ${item.landlordEmail}` : ""}
                  {` · Registered ${new Date(item.createdAt).toLocaleDateString()}`}
                </p>
                <p className="mt-3 flex gap-2 text-sm">
                  <MapPin aria-hidden className="mt-0.5 size-4 shrink-0 text-teal-700" />
                  <span>
                    {address} ({item.catchment}){" "}
                    <a
                      href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`}
                      target="_blank"
                      rel="noreferrer"
                      className="font-semibold text-teal-700 underline-offset-2 hover:underline"
                    >
                      Open in Maps
                    </a>
                  </span>
                </p>
                {declared.length > 0 && (
                  <section className="mt-4 rounded-lg border border-border p-3">
                    <h3 className="text-sm font-semibold">Rooms declared: {totalRooms}</h3>
                    <ul className="mt-2 space-y-1 text-xs text-muted-foreground">
                      {declared.map((row, index) => (
                        <li key={index}>
                          {row.roomCount} × {row.variantName ? `${roomCategoryLabel(row.category)} – ${row.variantName}` : roomCategoryLabel(row.category)}
                          {` · ${ugx.format(row.pricePerTermUgx)} per bed`}
                          {row.selfContained ? " · self-contained" : ""}
                        </li>
                      ))}
                    </ul>
                  </section>
                )}
                {item.reviewStatus === "rejected" && item.rejectionReason && (
                  <p className="mt-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800">Sent back: {item.rejectionReason}</p>
                )}
              </div>
              {canDecide && (
                <div className="flex shrink-0 gap-2">
                  {item.reviewStatus === "pending" && (
                    <button type="button" disabled={busyId !== null} onClick={() => void decide(item, "reject")} className="inline-flex min-h-10 items-center gap-2 rounded-lg border border-red-200 px-4 text-sm font-semibold text-red-700 hover:bg-red-50 disabled:opacity-50">
                      {busy ? <Loader2 aria-hidden className="size-4 animate-spin" /> : <X aria-hidden className="size-4" />} Send back
                    </button>
                  )}
                  <button type="button" disabled={busyId !== null} onClick={() => void decide(item, "approve")} className="inline-flex min-h-10 items-center gap-2 rounded-lg bg-teal-600 px-4 text-sm font-semibold text-white hover:bg-teal-700 disabled:opacity-50">
                    {busy ? <Loader2 aria-hidden className="size-4 animate-spin" /> : <Check aria-hidden className="size-4" />} Approve
                  </button>
                </div>
              )}
            </div>
          </article>
        );
      })}
    </div>
  );
}
