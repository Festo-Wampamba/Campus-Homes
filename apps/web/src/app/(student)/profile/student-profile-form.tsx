"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { UNIVERSITIES, type University } from "@campushomes/shared";

import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { api, ApiError } from "@/lib/api";
import { cn } from "@/lib/utils";

const UNIVERSITY_LABELS: Record<University, string> = {
  MUK: "Makerere University (MUK)",
  MUBS: "Makerere University Business School (MUBS)",
  KIU: "Kampala International University (KIU)",
  KYU: "Kyambogo University (KYU)",
  other: "Other",
};

function errorMessage(err: unknown, fallback: string): string {
  if (err instanceof ApiError) {
    const body = err.body as { message?: string | string[] } | null;
    if (typeof body?.message === "string") return body.message;
    if (Array.isArray(body?.message)) return body.message.join(", ");
  }
  return fallback;
}

export function StudentProfileForm({ next }: { next: string }) {
  const router = useRouter();
  const [university, setUniversity] = useState<University | "">("");
  const [yearOfStudy, setYearOfStudy] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!university) return;
    setError(null);
    setPending(true);
    try {
      await api("/students/profile", {
        method: "POST",
        body: JSON.stringify({
          university,
          yearOfStudy: yearOfStudy ? Number(yearOfStudy) : null,
        }),
      });
      router.push(next);
      router.refresh();
    } catch (err) {
      setError(errorMessage(err, "Couldn't save your profile — try again."));
      setPending(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <div className="space-y-1.5">
        <Label htmlFor="university">University</Label>
        <select
          id="university"
          required
          value={university}
          onChange={(e) => setUniversity(e.target.value as University)}
          className={cn(
            "flex h-11 w-full rounded-md border border-input bg-background px-3 text-base text-foreground shadow-xs transition-colors duration-150",
            "focus-visible:border-ring focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring sm:h-10",
          )}
        >
          <option value="" disabled>
            Select your university
          </option>
          {UNIVERSITIES.map((id) => (
            <option key={id} value={id}>
              {UNIVERSITY_LABELS[id]}
            </option>
          ))}
        </select>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="yearOfStudy">Year of study (optional)</Label>
        <select
          id="yearOfStudy"
          value={yearOfStudy}
          onChange={(e) => setYearOfStudy(e.target.value)}
          className={cn(
            "flex h-11 w-full rounded-md border border-input bg-background px-3 text-base text-foreground shadow-xs transition-colors duration-150",
            "focus-visible:border-ring focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring sm:h-10",
          )}
        >
          <option value="">Prefer not to say</option>
          {[1, 2, 3, 4, 5, 6].map((year) => (
            <option key={year} value={year}>
              Year {year}
            </option>
          ))}
        </select>
      </div>
      <Button type="submit" disabled={pending || !university} className="w-full">
        {pending ? "Saving…" : "Save and continue"}
      </Button>
      <p role="status" className="min-h-5 text-sm text-destructive">
        {error}
      </p>
    </form>
  );
}
