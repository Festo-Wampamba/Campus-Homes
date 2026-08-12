"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { OpsPublishableSemester } from "@campushomes/shared";

import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { api, ApiError } from "@/lib/api";
import { cn } from "@/lib/utils";

function errorMessage(err: unknown, fallback: string): string {
  if (err instanceof ApiError) {
    const body = err.body as { message?: string | string[] } | null;
    if (typeof body?.message === "string") return body.message;
    if (Array.isArray(body?.message)) return body.message.join(", ");
  }
  return fallback;
}

/** A landlord-onboarded property never gets a listing (onboarding only creates
 * the property row), so after the lead approves a passed visit there's nothing
 * to publish. The lead picks the semester here, which creates the draft listing
 * and hands off to the existing publish form. */
export function CreateListingToPublish({
  propertyId,
  semesters,
}: {
  propertyId: string;
  semesters: OpsPublishableSemester[];
}) {
  const router = useRouter();
  const [semesterId, setSemesterId] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (semesters.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        No semester is configured for this property&apos;s catchment yet — add one in admin
        settings before this property can be published.
      </p>
    );
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setPending(true);
    try {
      const listing = await api<{ id: string }>("/ops/listings/draft", {
        method: "POST",
        body: JSON.stringify({ propertyId, semesterId }),
      });
      router.push(`/ops/publish/${listing.id}`);
    } catch (err) {
      setError(errorMessage(err, "Couldn't create the listing — try again."));
      setPending(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-3">
      <div className="space-y-1.5">
        <Label htmlFor="semester" required>
          Semester
        </Label>
        <select
          id="semester"
          required
          value={semesterId}
          onChange={(e) => setSemesterId(e.target.value)}
          className={cn(
            "flex h-11 w-full rounded-md border border-input bg-background px-3 text-base text-foreground shadow-xs transition-colors duration-150",
            "focus-visible:border-ring focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring sm:h-10",
          )}
        >
          <option value="" disabled>
            Select a semester
          </option>
          {semesters.map((semester) => (
            <option key={semester.id} value={semester.id}>
              {semester.name}
            </option>
          ))}
        </select>
      </div>
      <Button type="submit" disabled={pending || !semesterId}>
        {pending ? "Preparing…" : "Create listing & publish"}
      </Button>
      <p role="status" className="min-h-5 text-sm text-destructive">
        {error}
      </p>
    </form>
  );
}
