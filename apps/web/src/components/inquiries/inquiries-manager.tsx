"use client";

import { useEffect, useState } from "react";
import { Check, Forward, Mail, Phone, RotateCcw } from "lucide-react";

import { INQUIRY_STATUSES, type Inquiry, type InquiryForwardTarget } from "@campushomes/shared";

import { api, apiErrorMessage } from "@/lib/api";

const CATEGORY_LABELS: Record<string, string> = {
  general: "General",
  listing: "Listing",
  reservation: "Reservation",
  payment: "Payment",
  safety: "Safety",
  other: "Other",
};

type Filter = "all" | (typeof INQUIRY_STATUSES)[number];

export function InquiriesManager({
  initialInquiries,
  canResolve,
}: {
  initialInquiries: Inquiry[];
  canResolve: boolean;
}) {
  const [rows, setRows] = useState<Inquiry[]>(initialInquiries);
  const [filter, setFilter] = useState<Filter>("all");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [resolution, setResolution] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [forwardTargets, setForwardTargets] = useState<InquiryForwardTarget[] | null>(null);
  const [forwardTo, setForwardTo] = useState("");
  const [forwardNote, setForwardNote] = useState("");
  const [forwarding, setForwarding] = useState(false);
  const [forwardError, setForwardError] = useState<string | null>(null);
  const [forwardNotice, setForwardNotice] = useState<string | null>(null);

  useEffect(() => {
    if (!canResolve) return; // forward-targets requires the same permission as this whole console
    let cancelled = false;
    api<InquiryForwardTarget[]>("/admin/inquiries/forward-targets")
      .then((rows) => {
        if (!cancelled) setForwardTargets(rows);
      })
      .catch(() => {
        if (!cancelled) setForwardTargets([]);
      });
    return () => {
      cancelled = true;
    };
  }, [canResolve]);

  async function forwardInquiry(row: Inquiry) {
    if (!forwardTo) return;
    setForwarding(true);
    setForwardError(null);
    setForwardNotice(null);
    try {
      await api(`/admin/inquiries/${row.id}/forward`, {
        method: "POST",
        body: JSON.stringify({ recipientUserId: forwardTo, note: forwardNote.trim() || undefined }),
      });
      const target = forwardTargets?.find((t) => t.id === forwardTo);
      setForwardNotice(`Forwarded to ${target?.name ?? "recipient"}.`);
      setForwardTo("");
      setForwardNote("");
    } catch (err) {
      setForwardError(apiErrorMessage(err, "Couldn't forward this inquiry — try again."));
    } finally {
      setForwarding(false);
    }
  }

  const visible = filter === "all" ? rows : rows.filter((row) => row.status === filter);
  const openCount = rows.filter((row) => row.status === "open").length;
  const selected = rows.find((row) => row.id === selectedId) ?? null;

  function select(row: Inquiry) {
    setSelectedId(row.id);
    setResolution(row.resolution ?? "");
    setError(null);
    setForwardTo("");
    setForwardNote("");
    setForwardError(null);
    setForwardNotice(null);
  }

  async function setStatus(row: Inquiry, status: "open" | "resolved") {
    setPending(true);
    setError(null);
    try {
      const updated = await api<Inquiry>(`/admin/inquiries/${row.id}`, {
        method: "PATCH",
        body: JSON.stringify({ status, resolution: status === "resolved" ? resolution.trim() || null : null }),
      });
      if (updated) setRows((current) => current.map((r) => (r.id === updated.id ? updated : r)));
    } catch (err) {
      setError(apiErrorMessage(err, "Couldn't update this inquiry — try again."));
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="grid gap-5 xl:grid-cols-[1fr_24rem]">
      <div>
        <div className="flex flex-wrap items-center gap-2">
          {(["all", ...INQUIRY_STATUSES] as Filter[]).map((value) => (
            <button
              key={value}
              type="button"
              onClick={() => setFilter(value)}
              className={
                filter === value
                  ? "inline-flex h-8 items-center rounded-lg bg-slate-900 px-3 text-xs font-bold text-white dark:bg-teal-600"
                  : "inline-flex h-8 items-center rounded-lg border border-slate-200 px-3 text-xs font-bold text-slate-600 hover:bg-slate-100 dark:border-border dark:text-muted-foreground dark:hover:bg-muted"
              }
            >
              {value === "all" ? `All (${rows.length})` : value === "open" ? `Open (${openCount})` : `Resolved (${rows.length - openCount})`}
            </button>
          ))}
        </div>

        <div className="mt-3 overflow-hidden rounded-xl border border-slate-200 dark:border-border">
          {visible.length === 0 ? (
            <p className="p-6 text-center text-sm text-muted-foreground">No inquiries here.</p>
          ) : (
            <ul className="divide-y divide-slate-200 dark:divide-border">
              {visible.map((row) => (
                <li key={row.id}>
                  <button
                    type="button"
                    onClick={() => select(row)}
                    className={
                      selectedId === row.id
                        ? "w-full bg-slate-100 p-4 text-left dark:bg-muted/60"
                        : "w-full p-4 text-left hover:bg-slate-50 dark:hover:bg-muted/40"
                    }
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="font-semibold">{row.subject}</span>
                      <span
                        className={
                          row.status === "resolved"
                            ? "rounded-full bg-teal-100 px-2.5 py-0.5 text-xs font-bold text-teal-900 dark:bg-teal-950 dark:text-teal-100"
                            : "rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-bold text-amber-900 dark:bg-amber-950 dark:text-amber-100"
                        }
                      >
                        {row.status === "resolved" ? "Resolved" : "Open"}
                      </span>
                    </div>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      {CATEGORY_LABELS[row.category] ?? row.category} · {row.studentName ?? "Unknown student"} ·{" "}
                      {new Date(row.createdAt).toLocaleString(undefined, {
                        day: "numeric",
                        month: "short",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </p>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      <aside className="h-fit rounded-xl border border-slate-200 p-4 dark:border-border">
        {!selected ? (
          <p className="text-sm text-muted-foreground">Select an inquiry to read it and respond.</p>
        ) : (
          <div className="space-y-4">
            <div>
              <h3 className="font-bold">{selected.subject}</h3>
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                {CATEGORY_LABELS[selected.category] ?? selected.category}
              </p>
            </div>

            <div className="space-y-1 rounded-lg bg-muted p-3 text-sm">
              <p className="font-semibold">{selected.studentName ?? "Unknown student"}</p>
              {selected.studentEmail && (
                <a href={`mailto:${selected.studentEmail}`} className="flex items-center gap-1.5 text-xs hover:underline">
                  <Mail aria-hidden className="size-3.5" />
                  {selected.studentEmail}
                </a>
              )}
              {selected.studentPhone && (
                <a href={`tel:${selected.studentPhone}`} className="flex items-center gap-1.5 text-xs hover:underline">
                  <Phone aria-hidden className="size-3.5" />
                  {selected.studentPhone}
                </a>
              )}
            </div>

            <p className="whitespace-pre-line text-sm">{selected.message}</p>

            {canResolve && (
              <div className="space-y-2 border-t border-slate-200 pt-4 dark:border-border">
                <label
                  htmlFor={`forward-${selected.id}`}
                  className="text-xs font-semibold text-muted-foreground"
                >
                  Forward to
                </label>
                <select
                  id={`forward-${selected.id}`}
                  value={forwardTo}
                  onChange={(e) => setForwardTo(e.target.value)}
                  disabled={!forwardTargets}
                  className="w-full rounded-lg border border-input bg-background p-2.5 text-sm"
                >
                  <option value="">
                    {forwardTargets ? "Choose a person…" : "Loading…"}
                  </option>
                  {forwardTargets?.map((target) => (
                    <option key={target.id} value={target.id}>
                      {target.label}
                    </option>
                  ))}
                </select>
                <textarea
                  rows={2}
                  maxLength={500}
                  value={forwardNote}
                  onChange={(e) => setForwardNote(e.target.value)}
                  placeholder="Optional note for them…"
                  className="w-full rounded-lg border border-input bg-background p-3 text-sm"
                />
                {forwardError && (
                  <p className="text-xs font-semibold text-destructive">{forwardError}</p>
                )}
                {forwardNotice && (
                  <p className="text-xs font-semibold text-teal-700 dark:text-teal-400">{forwardNotice}</p>
                )}
                <button
                  type="button"
                  disabled={forwarding || !forwardTo}
                  onClick={() => forwardInquiry(selected)}
                  className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-slate-300 px-3 text-xs font-bold hover:bg-slate-100 disabled:opacity-50 dark:border-border dark:hover:bg-muted"
                >
                  <Forward aria-hidden className="size-4" />
                  {forwarding ? "Forwarding…" : "Forward"}
                </button>
              </div>
            )}

            {canResolve && (
              <div className="space-y-2 border-t border-slate-200 pt-4 dark:border-border">
                <label htmlFor={`resolution-${selected.id}`} className="text-xs font-semibold text-muted-foreground">
                  Response to the student
                </label>
                <textarea
                  id={`resolution-${selected.id}`}
                  rows={4}
                  maxLength={2000}
                  value={resolution}
                  onChange={(e) => setResolution(e.target.value)}
                  placeholder="What was done / the answer for the student…"
                  className="w-full rounded-lg border border-input bg-background p-3 text-sm"
                />
                {error && <p className="text-xs font-semibold text-destructive">{error}</p>}
                <div className="flex gap-2">
                  {selected.status === "open" && (
                    <button
                      type="button"
                      disabled={pending}
                      onClick={() => setStatus(selected, "resolved")}
                      className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-teal-600 px-3 text-xs font-bold text-white hover:bg-teal-700 disabled:opacity-50"
                    >
                      <Check aria-hidden className="size-4" />
                      Resolve
                    </button>
                  )}
                  {selected.status === "resolved" && (
                    <button
                      type="button"
                      disabled={pending}
                      onClick={() => setStatus(selected, "open")}
                      className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-slate-300 px-3 text-xs font-bold hover:bg-slate-100 disabled:opacity-50 dark:border-border dark:hover:bg-muted"
                    >
                      <RotateCcw aria-hidden className="size-4" />
                      Reopen
                    </button>
                  )}
                </div>
              </div>
            )}

            {!canResolve && selected.resolution && (
              <div className="rounded-lg bg-muted p-3 text-sm">
                <p className="font-semibold">Response</p>
                <p className="mt-1 whitespace-pre-line text-muted-foreground">{selected.resolution}</p>
              </div>
            )}
          </div>
        )}
      </aside>
    </div>
  );
}
