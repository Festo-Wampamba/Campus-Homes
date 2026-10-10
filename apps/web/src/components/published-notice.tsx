"use client";

import { useEffect, useState } from "react";
import { PartyPopper, X } from "lucide-react";

import { api } from "@/lib/api";

type NotificationRow = {
  id: string;
  templateKey: string;
  payload: { message?: string };
  readAt: string | null;
};

/** The "your property is live" notice. Shown once: it is marked read as soon
 * as it appears, so the next visit or refresh no longer shows it. */
export function PublishedNotice() {
  const [messages, setMessages] = useState<string[]>([]);

  useEffect(() => {
    let cancelled = false;
    api<NotificationRow[]>("/notifications")
      .then(async (rows) => {
        const unread = rows.filter((r) => r.templateKey === "listing.published" && !r.readAt);
        if (cancelled || unread.length === 0) return;
        setMessages(unread.map((r) => r.payload.message ?? "Your property has been verified and published by our team. Thank you so much!"));
        await Promise.all(unread.map((r) => api(`/notifications/${r.id}/read`, { method: "POST" })));
        window.dispatchEvent(new Event("campushomes:notifications-refresh"));
      })
      .catch(() => {
        // Best-effort: with no notice the dashboard simply shows nothing here.
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (messages.length === 0) return null;
  return (
    <div role="status" className="flex items-start gap-3 rounded-lg border border-primary/30 bg-accent px-4 py-3 text-sm font-semibold text-teal-700">
      <PartyPopper aria-hidden className="mt-0.5 size-5 shrink-0" />
      <div className="flex-1 space-y-1">
        {messages.map((m) => <p key={m}>{m}</p>)}
      </div>
      <button
        type="button"
        aria-label="Dismiss"
        onClick={() => setMessages([])}
        className="grid size-7 shrink-0 place-items-center rounded-md hover:bg-primary/10 focus-visible:outline-2 focus-visible:outline-ring"
      >
        <X aria-hidden className="size-4" />
      </button>
    </div>
  );
}
