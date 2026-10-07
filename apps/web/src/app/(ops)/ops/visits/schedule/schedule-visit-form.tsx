"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { OpsInspector } from "@campushomes/shared";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { api, ApiError } from "@/lib/api";
import { cn } from "@/lib/utils";

// Hour, minute and AM/PM pickers instead of the native datetime-local popup,
// which has no confirm button and covered the form's submit button. Any time
// of day can be set, in 5-minute steps, with AM/PM spelled out.
const HOURS = Array.from({ length: 12 }, (_, i) => String(i + 1));
const MINUTES = Array.from({ length: 12 }, (_, i) => String(i * 5).padStart(2, "0"));
type Period = "AM" | "PM";

/** 12-hour picker values to a 24-hour "HH:MM" string ("" until an hour is picked). */
export function to24Hour(hour: string, minute: string, period: Period): string {
  if (!hour) return "";
  const h = (Number(hour) % 12) + (period === "PM" ? 12 : 0);
  return `${String(h).padStart(2, "0")}:${minute}`;
}

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
  const [hour, setHour] = useState("");
  const [minute, setMinute] = useState("00");
  const [period, setPeriod] = useState<Period>("AM");
  const time = to24Hour(hour, minute, period);
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
      setError(errorMessage(err, "Couldn't schedule the visit. Try again."));
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
              {inspector.team === "lead" ? ", lead, self-assign" : ""})
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
        <fieldset className="space-y-1.5">
          <legend className="text-sm font-semibold text-foreground">
            Time <span className="text-destructive" aria-hidden>*</span>
          </legend>
          <div className="flex items-center gap-2">
            <select
              id="visitHour"
              aria-label="Hour"
              required
              value={hour}
              onChange={(e) => setHour(e.target.value)}
              className={cn(selectClassName, "w-auto min-w-0 flex-1")}
            >
              <option value="" disabled>
                Hour
              </option>
              {HOURS.map((h) => (
                <option key={h} value={h}>
                  {h}
                </option>
              ))}
            </select>
            <span aria-hidden className="font-semibold text-muted-foreground">:</span>
            <select
              id="visitMinute"
              aria-label="Minutes"
              value={minute}
              onChange={(e) => setMinute(e.target.value)}
              className={cn(selectClassName, "w-auto min-w-0 flex-1")}
            >
              {MINUTES.map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </select>
            <div role="radiogroup" aria-label="AM or PM" className="flex shrink-0 overflow-hidden rounded-md border border-input">
              {(["AM", "PM"] as const).map((p) => (
                <button
                  key={p}
                  type="button"
                  role="radio"
                  aria-checked={period === p}
                  onClick={() => setPeriod(p)}
                  className={cn(
                    "h-11 px-3 text-sm font-semibold transition-colors sm:h-10",
                    period === p ? "bg-primary text-primary-foreground" : "bg-background text-foreground hover:bg-muted",
                  )}
                >
                  {p}
                </button>
              ))}
            </div>
          </div>
        </fieldset>
      </div>
      {scheduledAt && (
        <p className="rounded-md bg-teal-50 px-3 py-2 text-sm font-medium text-teal-800">
          Visit on{" "}
          {new Date(scheduledAt).toLocaleString("en-GB", {
            weekday: "short", day: "numeric", month: "short", year: "numeric",
            hour: "numeric", minute: "2-digit", hour12: true,
          })}
        </p>
      )}
      <Button type="submit" disabled={pending || !propertyId} className="w-full">
        {pending ? "Scheduling…" : "Schedule visit"}
      </Button>
      <p role="status" className="min-h-5 text-sm text-destructive">
        {error}
      </p>
    </form>
  );
}
