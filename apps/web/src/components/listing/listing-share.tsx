"use client";

import { useState, useSyncExternalStore } from "react";
import { Check, Link2, Mail, MessageCircle } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";

function subscribe(callback: () => void) {
  window.addEventListener("popstate", callback);
  return () => window.removeEventListener("popstate", callback);
}
function currentListingUrl() {
  const url = new URL(window.location.href);
  const room = url.searchParams.get("room");
  url.search = "";
  url.hash = "";
  if (room) url.searchParams.set("room", room);
  return url.toString();
}

export function ListingShare({ propertyName }: { propertyName: string }) {
  const url = useSyncExternalStore(subscribe, currentListingUrl, () => "");
  const [state, setState] = useState<"idle" | "copied" | "error">("idle");
  const text = `${propertyName} on CampusHomes\n${url}`;
  async function copy() {
    try {
      await navigator.clipboard.writeText(url);
      setState("copied");
    } catch {
      setState("error");
    }
  }
  const iconClass = buttonVariants({ variant: "ghost", size: "icon", className: "min-h-11 min-w-11" });
  return <section aria-label="Share this hostel" className="rounded-2xl border border-border bg-card p-4 shadow-sm">
    <div className="flex flex-wrap items-center justify-between gap-2">
      <h2 className="text-sm font-semibold">Share this hostel</h2>
      <div className="flex items-center gap-1">
        <a className={iconClass} aria-label="Share on WhatsApp" title="WhatsApp" href={url ? `https://wa.me/?text=${encodeURIComponent(text)}` : undefined} target="_blank" rel="noopener noreferrer"><MessageCircle aria-hidden /></a>
        <Button type="button" variant="ghost" size="icon" className="min-h-11 min-w-11" aria-label={state === "copied" ? "Link copied" : "Copy hostel link"} title="Copy link" disabled={!url} onClick={copy}>{state === "copied" ? <Check aria-hidden /> : <Link2 aria-hidden />}</Button>
        <a className={iconClass} aria-label="Share by email" title="Email" href={url ? `mailto:?subject=${encodeURIComponent(`${propertyName} | CampusHomes`)}&body=${encodeURIComponent(text)}` : undefined}><Mail aria-hidden /></a>
      </div>
    </div>
    {state === "copied" && <p role="status" className="mt-2 text-sm text-primary">Hostel link copied.</p>}
    {state === "error" && <p role="alert" className="mt-2 text-sm text-destructive">Couldn’t copy automatically. Select and copy this link:</p>}
    {state === "error" && <input aria-label="Hostel link to copy" readOnly value={url} onFocus={event => event.currentTarget.select()} className="mt-2 min-h-11 w-full rounded-md border border-border bg-background px-3 text-sm" />}
  </section>;
}
