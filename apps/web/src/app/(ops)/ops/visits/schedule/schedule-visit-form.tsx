"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { OpsInspector } from "@campushomes/shared";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { api, ApiError } from "@/lib/api";
import { cn } from "@/lib/utils";

// 30-minute visiting slots, 07:00–19:30. A plain select replaces the native
// datetime-local popup, which has no confirm button and covered the form's
// submit button, leaving leads unsure how to "save" a time.
const TIME_SLOTS = Array.from({ length: 26 }, (_, i) => {
  const minutes = 7 * 60 + i * 30;
  const value = `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
  const hour12 = ((Math.floor(minutes / 60) + 11) % 12) + 1;
  return { value, label: `${hour12}:${String(minutes % 60).padStart(2, "0")} ${minutes < 12 * 60 ? "AM" : "PM"}` };
});

const selectClassName = cn(
  "flex h-11 w-full rounded-md border border-input bg-background px-3 text-base text-foreground shadow-xs transition-colors duration-150",
  "focus-visible:border-ring focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring sm:h-10",
);

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
  const [date, setDate] = useState("");
  const [time, setTime] = useState("");
  // Local date string, so "today" matches the lead's own calendar.
  const [today] = useState(() => new Date().toLocaleDateString("en-CA"));
  const scheduledAt = date && time ? `${date}T${time}` : "";
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
        <Label htmlFor="inspector" required>Inspector</Label>
        <select
          id="inspector"
          required
          value={inspectorId}
          onChange={(e) => setInspectorId(e.target.value)}
          className={selectClassName}
        >
          <option value="" disabled>
            Select an inspector
          </option>
          {inspectors.map((inspector) => (
            <option key={inspector.id} value={inspector.id}>
              {inspector.name} ({inspector.catchment}
              {inspector.team === "lead" ? ", lead — self-assign" : ""})
            </option>
          ))}
        </select>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="visitDate" required>Visit date</Label>
          <Input
            id="visitDate"
            type="date"
            required
            min={today}
            value={date}
            onChange={(e) => setDate(e.target.value)}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="visitTime" required>Time</Label>
          <select
            id="visitTime"
            required
            value={time}
            onChange={(e) => setTime(e.target.value)}
            className={selectClassName}
          >
            <option value="" disabled>
              Select a time
            </option>
            {TIME_SLOTS.map((slot) => (
              <option key={slot.value} value={slot.value}>
                {slot.label}
              </option>
            ))}
          </select>
        </div>
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
