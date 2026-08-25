"use client";

import { useState } from "react";
import { CheckCircle2, LifeBuoy } from "lucide-react";

import { INQUIRY_CATEGORIES, type Inquiry, type InquiryCategory } from "@campushomes/shared";

import { api, apiErrorMessage } from "@/lib/api";

const CATEGORY_LABELS: Record<InquiryCategory, string> = {
  general: "General question",
  listing: "A listing",
  reservation: "My reservation",
  payment: "Payment",
  safety: "Safety concern",
  other: "Something else",
};

const EMPTY_FORM = { category: "general" as InquiryCategory, subject: "", message: "" };

export function SupportDesk({ initialInquiries }: { initialInquiries: Inquiry[] }) {
  const [rows, setRows] = useState<Inquiry[]>(initialInquiries);
  const [form, setForm] = useState(EMPTY_FORM);
  const [pending, setPending] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!form.subject.trim() || !form.message.trim()) return;
    setPending(true);
    setError(null);
    try {
      const created = await api<Inquiry>("/inquiries", {
        method: "POST",
        body: JSON.stringify({ ...form, subject: form.subject.trim(), message: form.message.trim() }),
      });
      setRows((current) => (created ? [created, ...current] : current));
      setForm(EMPTY_FORM);
      setSubmitted(true);
    } catch (err) {
      setError(apiErrorMessage(err, "Couldn't send your inquiry — try again."));
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="space-y-6">
      <section className="rounded-xl border border-border bg-card p-5">
        <div className="flex items-center gap-2">
          <LifeBuoy aria-hidden className="size-5 text-teal-700" />
          <h2 className="text-base font-bold">Send an inquiry</h2>
        </div>
        <p className="mt-1 text-sm text-muted-foreground">
          Goes straight to our Ops team and admins — you&apos;ll see the reply here.
        </p>

        {submitted && (
          <div className="mt-4 flex items-start gap-2 rounded-lg border border-teal-200 bg-teal-50 p-3 text-sm text-teal-900 dark:border-teal-900 dark:bg-teal-950 dark:text-teal-100">
            <CheckCircle2 aria-hidden className="mt-0.5 size-4 shrink-0" />
            <p>
              Sent — the team has been notified by email. Track it under
              &ldquo;Your inquiries&rdquo; below.
            </p>
          </div>
        )}

        <form onSubmit={submit} className="mt-4 space-y-3">
          <div className="space-y-1.5">
            <label htmlFor="inquiry-category" className="text-xs font-semibold text-muted-foreground">
              What is it about?
            </label>
            <select
              id="inquiry-category"
              value={form.category}
              onChange={(e) => setForm((f) => ({ ...f, category: e.target.value as InquiryCategory }))}
              className="h-10 w-full rounded-lg border border-input bg-background px-3 text-sm"
              required
            >
              {INQUIRY_CATEGORIES.map((category) => (
                <option key={category} value={category}>
                  {CATEGORY_LABELS[category]}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1.5">
            <label htmlFor="inquiry-subject" className="text-xs font-semibold text-muted-foreground">
              Subject
            </label>
            <input
              id="inquiry-subject"
              type="text"
              maxLength={200}
              value={form.subject}
              onChange={(e) => setForm((f) => ({ ...f, subject: e.target.value }))}
              placeholder="Short summary of the issue"
              className="h-10 w-full rounded-lg border border-input bg-background px-3 text-sm"
              required
            />
          </div>
          <div className="space-y-1.5">
            <label htmlFor="inquiry-message" className="text-xs font-semibold text-muted-foreground">
              Details
            </label>
            <textarea
              id="inquiry-message"
              rows={5}
              maxLength={4000}
              value={form.message}
              onChange={(e) => setForm((f) => ({ ...f, message: e.target.value }))}
              placeholder="Include the property name and reservation details if relevant."
              className="w-full rounded-lg border border-input bg-background p-3 text-sm"
              required
            />
          </div>
          {error && <p className="text-sm font-semibold text-destructive">{error}</p>}
          <button
            type="submit"
            disabled={pending || !form.subject.trim() || !form.message.trim()}
            className="inline-flex h-10 items-center justify-center rounded-lg bg-teal-600 px-5 text-sm font-bold text-white hover:bg-teal-700 disabled:opacity-50"
          >
            {pending ? "Sending…" : "Send to Ops team"}
          </button>
        </form>
      </section>

      <section className="rounded-xl border border-border bg-card p-5">
        <h2 className="text-base font-bold">Your inquiries</h2>
        {rows.length === 0 ? (
          <p className="mt-2 text-sm text-muted-foreground">
            Nothing yet — anything you send shows up here with the team&apos;s response.
          </p>
        ) : (
          <ul className="mt-3 space-y-3">
            {rows.map((row) => (
              <li key={row.id} className="rounded-lg border border-border p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="font-semibold">{row.subject}</p>
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
                <p className="mt-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  {CATEGORY_LABELS[row.category]} ·{" "}
                  {new Date(row.createdAt).toLocaleDateString(undefined, {
                    day: "numeric",
                    month: "short",
                    year: "numeric",
                  })}
                </p>
                <p className="mt-2 whitespace-pre-line text-sm text-muted-foreground">{row.message}</p>
                {row.resolution && (
                  <div className="mt-3 rounded-lg bg-muted p-3 text-sm">
                    <p className="font-semibold">Team response</p>
                    <p className="mt-1 whitespace-pre-line text-muted-foreground">{row.resolution}</p>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
