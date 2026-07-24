"use client";

import { CalendarClock, ChevronLeft, ChevronRight, Plus, Trash2 } from "lucide-react";
import { useMemo, useState } from "react";
import { CALENDAR_EVENT_TYPES, type CalendarEvent, type CalendarEventType } from "@campushomes/shared";

import { Button } from "@/components/ui/button";
import { Dialog, DialogBody, DialogFooter, DialogHeader } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { api, ApiError } from "@/lib/api";
import { cn } from "@/lib/utils";

const TYPE_LABEL: Record<CalendarEventType, string> = {
  task: "Task",
  reminder: "Reminder",
  activity: "Activity",
};
const TYPE_DOT: Record<CalendarEventType, string> = {
  task: "bg-teal-600",
  reminder: "bg-amber-500",
  activity: "bg-violet-600",
};
const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const selectClass = cn(
  "flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm text-foreground shadow-xs transition-colors duration-150",
  "focus-visible:border-ring focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
);

function toDateKey(iso: string): string {
  return iso.slice(0, 10);
}
function monthLabel(date: Date): string {
  return date.toLocaleDateString(undefined, { month: "long", year: "numeric" });
}
function errorMessage(err: unknown, fallback: string): string {
  if (err instanceof ApiError) {
    const body = err.body as { message?: string | string[] } | null;
    if (typeof body?.message === "string") return body.message;
    if (Array.isArray(body?.message)) return body.message.join(", ");
  }
  return fallback;
}

export function CalendarView({ initialEvents }: { initialEvents: CalendarEvent[] }) {
  const [monthCursor, setMonthCursor] = useState(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), 1);
  });
  const [events, setEvents] = useState<CalendarEvent[]>(initialEvents);
  const [loading, setLoading] = useState(false);
  const [formDate, setFormDate] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [eventType, setEventType] = useState<CalendarEventType>("task");
  const [time, setTime] = useState("09:00");
  const [allDay, setAllDay] = useState(false);
  const [description, setDescription] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const eventsByDay = useMemo(() => {
    const map = new Map<string, CalendarEvent[]>();
    for (const event of events) {
      const key = toDateKey(event.startsAt);
      map.set(key, [...(map.get(key) ?? []), event]);
    }
    return map;
  }, [events]);

  const gridDays = useMemo(() => {
    const first = monthCursor;
    const startOffset = first.getDay();
    const gridStart = new Date(first.getFullYear(), first.getMonth(), 1 - startOffset);
    return Array.from({ length: 42 }, (_, i) => {
      const date = new Date(gridStart);
      date.setDate(gridStart.getDate() + i);
      return date;
    });
  }, [monthCursor]);

  const upcoming = useMemo(
    () =>
      events
        .filter((e) => !e.done)
        .sort((a, b) => a.startsAt.localeCompare(b.startsAt))
        .slice(0, 8),
    [events],
  );

  async function loadMonth(cursor: Date) {
    setLoading(true);
    try {
      const from = new Date(cursor.getFullYear(), cursor.getMonth() - 1, 1).toISOString();
      const to = new Date(cursor.getFullYear(), cursor.getMonth() + 2, 0).toISOString();
      const rows = await api<CalendarEvent[]>(`/calendar?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`);
      setEvents(rows ?? []);
    } catch {
      // keep whatever's currently shown rather than blanking the calendar
    } finally {
      setLoading(false);
    }
  }

  function changeMonth(delta: number) {
    const next = new Date(monthCursor.getFullYear(), monthCursor.getMonth() + delta, 1);
    setMonthCursor(next);
    void loadMonth(next);
  }

  function openAddForm(dateKey: string) {
    setFormDate(dateKey);
    setTitle("");
    setEventType("task");
    setTime("09:00");
    setAllDay(false);
    setDescription("");
    setError(null);
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!formDate || !title.trim()) return;
    setPending(true);
    setError(null);
    try {
      const startsAt = new Date(`${formDate}T${allDay ? "00:00" : time}:00`).toISOString();
      const created = await api<CalendarEvent>("/calendar", {
        method: "POST",
        body: JSON.stringify({
          title: title.trim(),
          eventType,
          startsAt,
          allDay,
          description: description.trim() || undefined,
        }),
      });
      if (created) setEvents((current) => [...current, created]);
      setFormDate(null);
    } catch (err) {
      setError(errorMessage(err, "Couldn't save this event — try again."));
    } finally {
      setPending(false);
    }
  }

  async function toggleDone(event: CalendarEvent) {
    setEvents((current) => current.map((e) => (e.id === event.id ? { ...e, done: !e.done } : e)));
    try {
      await api(`/calendar/${event.id}`, { method: "PATCH", body: JSON.stringify({ done: !event.done }) });
    } catch {
      setEvents((current) => current.map((e) => (e.id === event.id ? { ...e, done: event.done } : e)));
    }
  }

  async function removeEvent(id: string) {
    const previous = events;
    setEvents((current) => current.filter((e) => e.id !== id));
    try {
      await api(`/calendar/${id}`, { method: "DELETE" });
    } catch {
      setEvents(previous);
    }
  }

  const today = toDateKey(new Date().toISOString());

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_20rem]">
      <div className="rounded-lg border border-border bg-card">
        <div className="flex items-center justify-between border-b border-border p-4">
          <div className="flex items-center gap-2">
            <Button type="button" variant="secondary" size="icon" aria-label="Previous month" onClick={() => changeMonth(-1)} disabled={loading}>
              <ChevronLeft aria-hidden className="size-4" />
            </Button>
            <h2 className="w-40 text-center font-display text-base font-bold text-foreground">
              {monthLabel(monthCursor)}
            </h2>
            <Button type="button" variant="secondary" size="icon" aria-label="Next month" onClick={() => changeMonth(1)} disabled={loading}>
              <ChevronRight aria-hidden className="size-4" />
            </Button>
          </div>
          <Button type="button" size="sm" onClick={() => openAddForm(today)}>
            <Plus aria-hidden className="size-4" />
            Add event
          </Button>
        </div>
        <div className="grid grid-cols-7 border-b border-border text-center text-xs font-bold text-muted-foreground">
          {WEEKDAYS.map((day) => (
            <div key={day} className="p-2">{day}</div>
          ))}
        </div>
        <div className="grid grid-cols-7">
          {gridDays.map((date) => {
            const key = toDateKey(date.toISOString());
            const dayEvents = eventsByDay.get(key) ?? [];
            const inMonth = date.getMonth() === monthCursor.getMonth();
            return (
              <button
                key={key}
                type="button"
                onClick={() => openAddForm(key)}
                className={cn(
                  "flex min-h-24 flex-col gap-1 border-b border-r border-border p-1.5 text-left transition-colors hover:bg-muted/50",
                  !inMonth && "text-muted-foreground/50",
                )}
              >
                <span className={cn("grid size-6 place-items-center rounded-full text-xs font-semibold", key === today && "bg-primary text-primary-foreground")}>
                  {date.getDate()}
                </span>
                <div className="flex flex-col gap-0.5">
                  {dayEvents.slice(0, 3).map((event) => (
                    <span key={event.id} className={cn("flex items-center gap-1 truncate rounded px-1 py-0.5 text-[10px] font-medium", event.done ? "text-muted-foreground line-through" : "text-foreground")}>
                      <span aria-hidden className={cn("size-1.5 shrink-0 rounded-full", TYPE_DOT[event.eventType])} />
                      {event.title}
                    </span>
                  ))}
                  {dayEvents.length > 3 && (
                    <span className="text-[10px] text-muted-foreground">+{dayEvents.length - 3} more</span>
                  )}
                </div>
              </button>
            );
          })}
        </div>
      </div>

      <div className="rounded-lg border border-border bg-card p-4">
        <div className="mb-3 flex items-center gap-2">
          <CalendarClock aria-hidden className="size-4 text-teal-700" />
          <h3 className="font-display text-sm font-bold text-foreground">Upcoming</h3>
        </div>
        {upcoming.length === 0 ? (
          <p className="text-sm text-muted-foreground">No tasks or reminders scheduled.</p>
        ) : (
          <ul className="space-y-2">
            {upcoming.map((event) => (
              <li key={event.id} className="flex items-start gap-2 rounded-md border border-border p-2">
                <input
                  type="checkbox"
                  className="mt-0.5"
                  checked={event.done}
                  onChange={() => void toggleDone(event)}
                  aria-label={`Mark "${event.title}" done`}
                />
                <div className="min-w-0 flex-1">
                  <p className={cn("truncate text-sm font-semibold", event.done && "text-muted-foreground line-through")}>
                    {event.title}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {TYPE_LABEL[event.eventType]} · {new Date(event.startsAt).toLocaleDateString(undefined, { month: "short", day: "numeric" })}
                    {!event.allDay && ` · ${new Date(event.startsAt).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })}`}
                  </p>
                </div>
                <button
                  type="button"
                  aria-label={`Delete "${event.title}"`}
                  onClick={() => void removeEvent(event.id)}
                  className="shrink-0 rounded p-1 text-muted-foreground transition-colors hover:bg-red-50 hover:text-red-700 dark:hover:bg-red-950"
                >
                  <Trash2 aria-hidden className="size-3.5" />
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <Dialog open={formDate !== null} onOpenChange={(open) => !open && setFormDate(null)}>
        <DialogHeader title="Add calendar event" description={formDate ?? undefined} onClose={() => setFormDate(null)} />
        <form onSubmit={submit} className="flex min-h-0 flex-1 flex-col">
          <DialogBody className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="event-title" required>Title</Label>
              <Input id="event-title" required value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Pay rent, property visit, submit report…" />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="event-type">Type</Label>
                <select id="event-type" className={selectClass} value={eventType} onChange={(e) => setEventType(e.target.value as CalendarEventType)}>
                  {CALENDAR_EVENT_TYPES.map((type) => (
                    <option key={type} value={type}>{TYPE_LABEL[type]}</option>
                  ))}
                </select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="event-time">Time</Label>
                <Input id="event-time" type="time" disabled={allDay} value={time} onChange={(e) => setTime(e.target.value)} />
              </div>
            </div>
            <label className="flex items-center gap-2 text-sm font-semibold text-foreground">
              <input type="checkbox" checked={allDay} onChange={(e) => setAllDay(e.target.checked)} />
              All-day
            </label>
            <div className="space-y-1.5">
              <Label htmlFor="event-description">Notes (optional)</Label>
              <Input id="event-description" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Any extra detail" />
            </div>
            {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
          </DialogBody>
          <DialogFooter>
            <Button type="button" variant="secondary" onClick={() => setFormDate(null)}>Cancel</Button>
            <Button type="submit" disabled={pending || !title.trim()}>{pending ? "Saving…" : "Add event"}</Button>
          </DialogFooter>
        </form>
      </Dialog>
    </div>
  );
}
