"use client";

import { useState } from "react";
import { Heart } from "lucide-react";

import { api } from "@/lib/api";
import { cn } from "@/lib/utils";

export function SaveButton({
  listingId,
  initialSaved,
}: {
  listingId: string;
  initialSaved: boolean;
}) {
  const [saved, setSaved] = useState(initialSaved);
  const [pending, setPending] = useState(false);

  async function toggle() {
    setPending(true);
    const next = !saved;
    setSaved(next); // optimistic — a failed toggle isn't worth blocking on
    try {
      if (next) {
        await api("/students/saved-listings", {
          method: "POST",
          body: JSON.stringify({ listingId }),
        });
      } else {
        await api(`/students/saved-listings/${listingId}`, { method: "DELETE" });
      }
    } catch {
      setSaved(!next); // roll back on failure
    } finally {
      setPending(false);
    }
  }

  return (
    <button
      type="button"
      onClick={toggle}
      disabled={pending}
      aria-pressed={saved}
      aria-label={saved ? "Remove from favourites" : "Save to favourites"}
      className="inline-flex h-9 items-center gap-1.5 rounded-md border border-border bg-card px-3 text-sm font-semibold text-foreground shadow-xs transition-colors duration-150 hover:bg-muted disabled:opacity-60"
    >
      <Heart
        aria-hidden
        className={cn("size-4", saved ? "fill-coral-500 text-coral-500" : "text-muted-foreground")}
      />
      {saved ? "Saved" : "Save"}
    </button>
  );
}
