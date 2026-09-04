"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { University } from "@campushomes/shared";

import { Button } from "@/components/ui/button";
import { UniversitySelectField } from "@/components/university-select-field";
import { api, ApiError } from "@/lib/api";

function errorMessage(err: unknown, fallback: string): string {
  if (err instanceof ApiError) {
    const body = err.body as { message?: string | string[] } | null;
    if (typeof body?.message === "string") return body.message;
    if (Array.isArray(body?.message)) return body.message.join(", ");
  }
  return fallback;
}

// The QR/tenant-agreement flow's equivalent of ReserveButton's inline "just
// one thing first" step — same one-field profile completion, but rendered
// directly on the page (there's no button to gate here; the whole page is
// already about this one property) instead of a hard redirect away to a
// separate /profile page and back. router.refresh() re-runs the server
// component once saved, which then finds the profile and renders the real
// agreement form in its place — no navigation, no lost context.
export function StudentProfileInlineStep() {
  const router = useRouter();
  const [university, setUniversity] = useState<University | "">("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!university) return;
    setPending(true);
    setError(null);
    try {
      await api("/students/profile", {
        method: "POST",
        body: JSON.stringify({ university, yearOfStudy: null }),
      });
      router.refresh();
    } catch (err) {
      setError(errorMessage(err, "Couldn't save your university — try again."));
      setPending(false);
    }
  }

  return (
    <>
      <h1 className="font-display text-lg font-bold text-foreground">Just one thing first</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        Which university are you at? This finishes setting up your student account — you only need to do
        it once, then you&apos;ll go straight into the agreement for this property.
      </p>
      <form onSubmit={submit} className="mt-4 space-y-3">
        <UniversitySelectField value={university} onChange={setUniversity} autoFocus />
        {error && <p className="text-sm font-semibold text-destructive">{error}</p>}
        <Button type="submit" disabled={pending || !university}>
          {pending ? "Saving…" : "Continue"}
        </Button>
      </form>
    </>
  );
}
