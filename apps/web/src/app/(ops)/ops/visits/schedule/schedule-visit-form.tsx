"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { OpsInspector } from "@campushomes/shared";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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

export function ScheduleVisitForm({
  propertyId,
  inspectors,
}: {
  propertyId: string;
  inspectors: OpsInspector[];
}) {
  const router = useRouter();
  const [inspectorId, setInspectorId] = useState("");
  const [scheduledAt, setScheduledAt] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!propertyId || !inspectorId || !scheduledAt) return;
    setError(null);
    setPending(true);
    try {
      await api("/ops/visits", {
        method: "POST",
        body: JSON.stringify({
          propertyId,
          inspectorId,
          scheduledAt: new Date(scheduledAt).toISOString(),
        }),
      });
      router.push("/ops");
      router.refresh();
    } catch (err) {
      setError(errorMessage(err, "Couldn't schedule the visit — try again."));
      setPending(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <div className="space-y-1.5">
        <Label htmlFor="inspector">Inspector</Label>
        <select
          id="inspector"
          required
          value={inspectorId}
          onChange={(e) => setInspectorId(e.target.value)}
          className={cn(
            "flex h-11 w-full rounded-md border border-input bg-background px-3 text-base text-foreground shadow-xs transition-colors duration-150",
            "focus-visible:border-ring focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring sm:h-10",
          )}
        >
          <option value="" disabled>
            Select an inspector
          </option>
          {inspectors.map((inspector) => (
            <option key={inspector.id} value={inspector.id}>
              {inspector.name} ({inspector.catchment})
            </option>
          ))}
        </select>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="scheduledAt">Scheduled for</Label>
        <Input
          id="scheduledAt"
          type="datetime-local"
          required
          value={scheduledAt}
          onChange={(e) => setScheduledAt(e.target.value)}
        />
      </div>
      <Button type="submit" disabled={pending || !propertyId} className="w-full">
        {pending ? "Scheduling…" : "Schedule visit"}
      </Button>
      <p role="status" className="min-h-5 text-sm text-destructive">
        {error}
      </p>
    </form>
  );
}
