"use client";

import { Bell, CalendarClock, ChevronLeft, ChevronRight, Plus, Trash2 } from "lucide-react";
import { useMemo, useState } from "react";
import { CALENDAR_EVENT_TYPES, type CalendarEvent, type CalendarEventType } from "@campushomes/shared";

import { Button } from "@/components/ui/button";
import { Dialog, DialogBody, DialogFooter, DialogHeader } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { api, apiErrorMessage } from "@/lib/api";
import { cn } from "@/lib/utils";

const TYPE_LABEL: Record<CalendarEventType, string> = {
  task: "Task",
  event: "Event",
  reminder: "Reminder",
  activity: "Activity",
};
// One colour per type, used for the dot, the chip in the month grid and the
// upcoming list, the way Google Calendar colours each calendar.
const TYPE_STYLE: Record<CalendarEventType, { dot: string; chip: string }> = {
  task: { dot: "bg-teal-600", chip: "border-teal-600 bg-teal-50 text-teal-900 dark:bg-teal-950 dark:text-teal-100" },
  event: { dot: "bg-sky-600", chip: "border-sky-600 bg-sky-50 text-sky-900 dark:bg-sky-950 dark:text-sky-100" },
  reminder: { dot: "bg-amber-500", chip: "border-amber-500 bg-amber-50 text-amber-900 dark:bg-amber-950 dark:text-amber-100" },
  activity: { dot: "bg-violet-600", chip: "border-violet-600 bg-violet-50 text-violet-900 dark:bg-violet-950 dark:text-violet-100" },
};
const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const SOON_MS = 24 * 60 * 60 * 1000;

/** yyyy-mm-dd in the viewer's own timezone. toISOString() is UTC, which put
 * every event (and "today") on the wrong day east of Greenwich. */
export function localDateKey(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}
function localTime(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(date.getHours())}:${pad(date.getMinutes())}`;
}
function timeLabel(iso: string): string {
  return new Date(iso).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit", hour12: true });
}
/** "in 25 min", "in 3 h", for events starting within a day. */
export function startsIn(iso: string, now = Date.now()): string | null {
  const ms = new Date(iso).getTime() - now;
  if (ms <= 0 || ms > SOON_MS) return null;
  const minutes = Math.max(1, Math.round(ms / 60_000));
  return minutes < 60 ? `in ${minutes} min` : `in ${Math.round(minutes / 60)} h`;
}

type Draft = {
  id: string | null;
  title: string;
  eventType: CalendarEventType;
  date: string;
  time: string;
  allDay: boolean;
  description: string;
  remind: boolean;
  done: boolean;
};

const newDraft = (date: string): Draft => ({
  id: null, title: "", eventType: "event", date, time: "09:00", allDay: false, description: "", remind: true, done: false,
});
const draftFrom = (event: CalendarEvent): Draft => {
  const start = new Date(event.startsAt);
  return {
    id: event.id, title: event.title, eventType: event.eventType, date: localDateKey(start), time: localTime(start),
    allDay: event.allDay, description: event.description ?? "", remind: event.remind ?? true, done: event.done,
  };
};

export function CalendarView({ initialEvents }: { initialEvents: CalendarEvent[] }) {
  const [monthCursor, setMonthCursor] = useState(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), 1);
  });
  const [events, setEvents] = useState<CalendarEvent[]>(initialEvents);
  const [loading, setLoading] = useState(false);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const eventsByDay = useMemo(() => {
    const map = new Map<string, CalendarEvent[]>();
    for (const event of [...events].sort((a, b) => a.startsAt.localeCompare(b.startsAt))) {
      const key = localDateKey(new Date(event.startsAt));
      map.set(key, [...(map.get(key) ?? []), event]);
    }
    return map;
  }, [events]);

  const gridDays = useMemo(() => {
    const first = monthCursor;
    const gridStart = new Date(first.getFullYear(), first.getMonth(), 1 - first.getDay());
    return Array.from({ length: 42 }, (_, i) => new Date(gridStart.getFullYear(), gridStart.getMonth(), gridStart.getDate() + i));
  }, [monthCursor]);

  const upcoming = useMemo(() => {
    const now = new Date().toISOString();
    return events
      .filter((e) => !e.done && e.startsAt >= now)
      .sort((a, b) => a.startsAt.localeCompare(b.startsAt))
      .slice(0, 8);
  }, [events]);

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

  function goToMonth(next: Date) {
    setMonthCursor(next);
    void loadMonth(next);
  }

  function open(next: Draft) {
    setDraft(next);
    setError(null);
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!draft || !draft.title.trim()) return;
    setPending(true);
    setError(null);
    const body = {
      title: draft.title.trim(),
      eventType: draft.eventType,
      startsAt: new Date(`${draft.date}T${draft.allDay ? "00:00" : draft.time}:00`).toISOString(),
      allDay: draft.allDay,
      description: draft.description.trim() || null,
      remind: draft.remind,
      ...(draft.id ? { done: draft.done } : {}),
    };
    try {
      const saved = await api<CalendarEvent>(draft.id ? `/calendar/${draft.id}` : "/calendar", {
        method: draft.id ? "PATCH" : "POST",
        body: JSON.stringify(body),
      });
      setEvents((current) => (draft.id ? current.map((ev) => (ev.id === saved.id ? saved : ev)) : [...current, saved]));
      setDraft(null);
    } catch (err) {
      setError(apiErrorMessage(err, "Couldn't save this event. Try again."));
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
    setDraft(null);
    try {
      await api(`/calendar/${id}`, { method: "DELETE" });
    } catch {
      setEvents(previous);
    }
  }

  const today = localDateKey(new Date());

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
      <div className="min-w-0 overflow-hidden rounded-lg border border-border bg-card">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border p-3 sm:p-4">
          <div className="flex items-center gap-1.5 sm:gap-2">
            <Button type="button" variant="secondary" size="sm" onClick={() => goToMonth(new Date(new Date().getFullYear(), new Date().getMonth(), 1))} disabled={loading}>
              Today
            </Button>
            <Button type="button" variant="secondary" size="icon" aria-label="Previous month" onClick={() => goToMonth(new Date(monthCursor.getFullYear(), monthCursor.getMonth() - 1, 1))} disabled={loading}>
              <ChevronLeft aria-hidden className="size-4" />
            </Button>
            <Button type="button" variant="secondary" size="icon" aria-label="Next month" onClick={() => goToMonth(new Date(monthCursor.getFullYear(), monthCursor.getMonth() + 1, 1))} disabled={loading}>
              <ChevronRight aria-hidden className="size-4" />
            </Button>
            <h2 className="ml-1 font-display text-base font-bold text-foreground sm:text-lg">
              {monthCursor.toLocaleDateString(undefined, { month: "long", year: "numeric" })}
            </h2>
          </div>
          <Button type="button" size="sm" onClick={() => open(newDraft(today))}>
            <Plus aria-hidden className="size-4" />
            Create
          </Button>
        </div>

        <div className="flex flex-wrap gap-x-4 gap-y-1 border-b border-border px-3 py-2 text-[11px] text-muted-foreground sm:px-4">
          {CALENDAR_EVENT_TYPES.map((type) => (
            <span key={type} className="inline-flex items-center gap-1.5">
              <span aria-hidden className={cn("size-2 rounded-full", TYPE_STYLE[type].dot)} />
              {TYPE_LABEL[type]}
            </span>
          ))}
        </div>

        <div className="grid grid-cols-7 border-b border-border text-center text-[11px] font-bold text-muted-foreground sm:text-xs">
          {WEEKDAYS.map((day) => (
            <div key={day} className="p-1.5 sm:p-2">
              <span className="sm:hidden">{day[0]}</span>
              <span className="hidden sm:inline">{day}</span>
            </div>
          ))}
        </div>
        <div className="grid grid-cols-7">
          {gridDays.map((date) => {
            const key = localDateKey(date);
            const dayEvents = eventsByDay.get(key) ?? [];
            const inMonth = date.getMonth() === monthCursor.getMonth();
            return (
              <div
                key={key}
                role="button"
                tabIndex={0}
                aria-label={`Add to ${date.toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "long" })}`}
                onClick={() => open(newDraft(key))}
                onKeyDown={(e) => {
                  if (e.key !== "Enter" && e.key !== " ") return;
                  e.preventDefault();
                  open(newDraft(key));
                }}
                className={cn(
                  "flex min-h-16 min-w-0 cursor-pointer flex-col gap-1 border-b border-r border-border p-1 text-left transition-colors hover:bg-muted/50 focus-visible:outline-2 focus-visible:outline-ring sm:min-h-24 sm:p-1.5",
                  !inMonth && "bg-muted/20 text-muted-foreground/50",
                )}
              >
                <span className={cn("grid size-6 place-items-center self-center rounded-full text-xs font-semibold sm:self-start", key === today && "bg-primary text-primary-foreground")}>
                  {date.getDate()}
                </span>
                {/* Phones: coloured dots. Larger screens: Google-style chips you can open. */}
                <div className="flex flex-wrap justify-center gap-0.5 sm:hidden">
                  {dayEvents.slice(0, 4).map((event) => (
                    <span key={event.id} aria-hidden className={cn("size-1.5 rounded-full", TYPE_STYLE[event.eventType].dot, event.done && "opacity-40")} />
                  ))}
                </div>
                <div className="hidden min-w-0 flex-col gap-0.5 sm:flex">
                  {dayEvents.slice(0, 3).map((event) => (
                    <button
                      key={event.id}
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        open(draftFrom(event));
                      }}
                      onKeyDown={(e) => e.stopPropagation()}
                      title={`${event.title}${event.allDay ? "" : ` · ${timeLabel(event.startsAt)}`}`}
                      className={cn(
                        "w-full truncate rounded border-l-2 px-1 py-0.5 text-left text-[10px] font-medium leading-tight hover:brightness-95",
                        TYPE_STYLE[event.eventType].chip,
                        event.done && "line-through opacity-60",
                      )}
                    >
                      {!event.allDay && <span className="mr-1 opacity-80">{timeLabel(event.startsAt)}</span>}
                      {event.title}
                    </button>
                  ))}
                  {dayEvents.length > 3 && (
                    <span className="px-1 text-[10px] text-muted-foreground">+{dayEvents.length - 3} more</span>
                  )}
                </div>
              </div>
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
          <p className="text-sm text-muted-foreground">Nothing coming up. Press Create or click a day to add something.</p>
        ) : (
          <ul className="space-y-2">
            {upcoming.map((event) => {
              const soon = startsIn(event.startsAt);
              return (
                <li key={event.id} className="flex items-start gap-2 rounded-md border border-border p-2 transition-colors hover:bg-muted/40">
                  <input
                    type="checkbox"
                    className="mt-1"
                    checked={event.done}
                    onChange={() => void toggleDone(event)}
                    aria-label={`Mark "${event.title}" done`}
                  />
                  <button type="button" onClick={() => open(draftFrom(event))} className="min-w-0 flex-1 text-left">
                    <span className="flex items-center gap-1.5">
                      <span aria-hidden className={cn("size-2 shrink-0 rounded-full", TYPE_STYLE[event.eventType].dot)} />
                      <span className="truncate text-sm font-semibold text-foreground">{event.title}</span>
                    </span>
                    <span className="mt-0.5 block text-xs text-muted-foreground">
                      {TYPE_LABEL[event.eventType]} · {new Date(event.startsAt).toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" })}
                      {event.allDay ? " · All day" : ` · ${timeLabel(event.startsAt)}`}
                    </span>
                    {soon && (
                      <span className="mt-1 inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-semibold text-amber-800 dark:bg-amber-950 dark:text-amber-200">
                        <Bell aria-hidden className="size-3" />
                        Starts {soon}
                      </span>
                    )}
                  </button>
                  <button
                    type="button"
                    aria-label={`Delete "${event.title}"`}
                    onClick={() => void removeEvent(event.id)}
                    className="shrink-0 rounded p-1 text-muted-foreground transition-colors hover:bg-red-50 hover:text-red-700 dark:hover:bg-red-950"
                  >
                    <Trash2 aria-hidden className="size-3.5" />
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <Dialog open={draft !== null} onOpenChange={(isOpen) => !isOpen && setDraft(null)} dismissible={false}>
        {draft && (
          <>
            <DialogHeader
              title={draft.id ? "Edit" : "Create"}
              description={new Date(`${draft.date}T00:00:00`).toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "long", year: "numeric" })}
              onClose={() => setDraft(null)}
            />
            <form onSubmit={save} className="flex min-h-0 flex-1 flex-col">
              <DialogBody className="space-y-4">
                <div className="space-y-1.5">
                  <Label htmlFor="event-title" required>Title</Label>
                  <Input id="event-title" required autoFocus value={draft.title} onChange={(e) => setDraft({ ...draft, title: e.target.value })} placeholder="Pay rent, property visit, submit report…" />
                </div>
                <div className="space-y-1.5">
                  <span className="text-sm font-semibold text-foreground">Type</span>
                  <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Type">
                    {CALENDAR_EVENT_TYPES.map((type) => (
                      <button
                        key={type}
                        type="button"
                        role="radio"
                        aria-checked={draft.eventType === type}
                        onClick={() => setDraft({ ...draft, eventType: type })}
                        className={cn(
                          "inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors",
                          draft.eventType === type ? TYPE_STYLE[type].chip : "border-border text-muted-foreground hover:bg-muted",
                        )}
                      >
                        <span aria-hidden className={cn("size-2 rounded-full", TYPE_STYLE[type].dot)} />
                        {TYPE_LABEL[type]}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <Label htmlFor="event-date" required>Date</Label>
                    <Input id="event-date" type="date" required value={draft.date} onChange={(e) => setDraft({ ...draft, date: e.target.value })} />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="event-time">Time</Label>
                    <Input id="event-time" type="time" disabled={draft.allDay} value={draft.time} onChange={(e) => setDraft({ ...draft, time: e.target.value })} />
                  </div>
                </div>
                <label className="flex items-center gap-2 text-sm font-semibold text-foreground">
                  <input type="checkbox" checked={draft.allDay} onChange={(e) => setDraft({ ...draft, allDay: e.target.checked })} />
                  All day
                </label>
                <label className="flex items-start gap-2 rounded-md border border-border p-3 text-sm text-foreground">
                  <input type="checkbox" className="mt-0.5" checked={draft.remind} onChange={(e) => setDraft({ ...draft, remind: e.target.checked })} />
                  <span>
                    <span className="flex items-center gap-1.5 font-semibold"><Bell aria-hidden className="size-3.5" />Email me reminders</span>
                    <span className="mt-0.5 block text-xs text-muted-foreground">
                      1 day, 10 hours, 5 hours, 30 minutes, 15 minutes, 5 minutes and 1 minute before, by email and in your notifications.
                    </span>
                  </span>
                </label>
                <div className="space-y-1.5">
                  <Label htmlFor="event-description">Notes (optional)</Label>
                  <textarea
                    id="event-description"
                    rows={3}
                    value={draft.description}
                    onChange={(e) => setDraft({ ...draft, description: e.target.value })}
                    placeholder="Any extra detail"
                    className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground shadow-xs focus-visible:border-ring focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                  />
                </div>
                {draft.id && (
                  <label className="flex items-center gap-2 text-sm font-semibold text-foreground">
                    <input type="checkbox" checked={draft.done} onChange={(e) => setDraft({ ...draft, done: e.target.checked })} />
                    Done
                  </label>
                )}
                {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
              </DialogBody>
              <DialogFooter>
                {draft.id && (
                  <Button type="button" variant="secondary" className="mr-auto text-destructive" onClick={() => void removeEvent(draft.id!)}>
                    <Trash2 aria-hidden className="size-4" />
                    Delete
                  </Button>
                )}
                <Button type="button" variant="secondary" onClick={() => setDraft(null)}>Cancel</Button>
                <Button type="submit" disabled={pending || !draft.title.trim() || !draft.date}>{pending ? "Saving…" : "Save"}</Button>
              </DialogFooter>
            </form>
          </>
        )}
      </Dialog>
    </div>
  );
}
