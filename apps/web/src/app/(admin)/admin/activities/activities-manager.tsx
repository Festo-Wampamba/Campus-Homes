"use client";

import { CalendarClock, ChevronLeft, ChevronRight, Plus, Trash2 } from "lucide-react";
import { useMemo, useState } from "react";
import {
  ACTIVITY_STATUSES,
  ACTIVITY_TYPES,
  type Activity,
  type ActivityStatus,
  type ActivityType,
} from "@campushomes/shared";

import { AdminField, AdminModal, adminFieldClass, adminTextareaClass } from "@/components/admin/admin-modal";
import { StatusBadge } from "@/components/admin/admin-ui";
import { api, apiErrorMessage } from "@/lib/api";
import { cn } from "@/lib/utils";

interface StaffRow {
  id: string;
  name: string | null;
  email: string | null;
}

const TYPE_LABEL: Record<ActivityType, string> = {
  task: "Task",
  meeting: "Meeting",
  visit: "Visit",
  maintenance: "Maintenance",
  other: "Other",
};
const STATUS_DOT: Record<ActivityStatus, string> = {
  pending: "bg-slate-400",
  in_progress: "bg-teal-600",
  done: "bg-emerald-600",
  cancelled: "bg-red-500",
};
const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function toDateKey(iso: string): string {
  return iso.slice(0, 10);
}
function monthLabel(date: Date): string {
  return date.toLocaleDateString(undefined, { month: "long", year: "numeric" });
}
function emptyForm() {
  return { title: "", description: "", activityType: "task" as ActivityType, status: "pending" as ActivityStatus, time: "09:00", allDay: false, assignedTo: "" };
}

export function ActivitiesManager({
  initialActivities,
  assignees,
  canManage,
}: {
  initialActivities: Activity[];
  assignees: StaffRow[];
  canManage: boolean;
}) {
  const [monthCursor, setMonthCursor] = useState(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), 1);
  });
  const [rows, setRows] = useState<Activity[]>(initialActivities);
  const [loading, setLoading] = useState(false);
  const [mode, setMode] = useState<"create" | "edit" | null>(null);
  const [selected, setSelected] = useState<Activity | null>(null);
  const [formDate, setFormDate] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm());
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const byDay = useMemo(() => {
    const map = new Map<string, Activity[]>();
    for (const row of rows) map.set(toDateKey(row.startsAt), [...(map.get(toDateKey(row.startsAt)) ?? []), row]);
    return map;
  }, [rows]);

  const gridDays = useMemo(() => {
    const startOffset = monthCursor.getDay();
    const gridStart = new Date(monthCursor.getFullYear(), monthCursor.getMonth(), 1 - startOffset);
    return Array.from({ length: 42 }, (_, i) => {
      const date = new Date(gridStart);
      date.setDate(gridStart.getDate() + i);
      return date;
    });
  }, [monthCursor]);

  const upcoming = useMemo(
    () => rows.filter((row) => row.status !== "done" && row.status !== "cancelled").sort((a, b) => a.startsAt.localeCompare(b.startsAt)).slice(0, 8),
    [rows],
  );

  async function loadMonth(cursor: Date) {
    setLoading(true);
    try {
      const from = new Date(cursor.getFullYear(), cursor.getMonth() - 1, 1).toISOString();
      const to = new Date(cursor.getFullYear(), cursor.getMonth() + 2, 0).toISOString();
      const data = await api<Activity[]>(`/admin/activities?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`);
      setRows(data ?? []);
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

  function openCreate(dateKey: string) {
    if (!canManage) return;
    setMode("create");
    setSelected(null);
    setFormDate(dateKey);
    setForm(emptyForm());
    setError(null);
  }

  function openEdit(activity: Activity) {
    setMode("edit");
    setSelected(activity);
    setFormDate(toDateKey(activity.startsAt));
    setForm({
      title: activity.title,
      description: activity.description ?? "",
      activityType: activity.activityType,
      status: activity.status,
      time: activity.allDay ? "00:00" : new Date(activity.startsAt).toISOString().slice(11, 16),
      allDay: activity.allDay,
      assignedTo: activity.assignedTo ?? "",
    });
    setError(null);
  }

  function close() {
    setMode(null);
    setSelected(null);
    setFormDate(null);
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!formDate || !form.title.trim()) return;
    setPending(true);
    setError(null);
    try {
      const startsAt = new Date(`${formDate}T${form.allDay ? "00:00" : form.time}:00`).toISOString();
      const payload = {
        title: form.title.trim(),
        description: form.description.trim() || undefined,
        activityType: form.activityType,
        status: form.status,
        startsAt,
        allDay: form.allDay,
        assignedTo: form.assignedTo || null,
      };
      if (mode === "edit" && selected) {
        const updated = await api<Activity>(`/admin/activities/${selected.id}`, { method: "PATCH", body: JSON.stringify(payload) });
        if (updated) setRows((current) => current.map((row) => (row.id === updated.id ? updated : row)));
      } else {
        const created = await api<Activity>("/admin/activities", { method: "POST", body: JSON.stringify(payload) });
        if (created) setRows((current) => [...current, created]);
      }
      close();
    } catch (err) {
      setError(apiErrorMessage(err, "Couldn't save this activity — try again."));
    } finally {
      setPending(false);
    }
  }

  async function removeActivity(id: string) {
    const previous = rows;
    setRows((current) => current.filter((row) => row.id !== id));
    try {
      await api(`/admin/activities/${id}`, { method: "DELETE" });
      close();
    } catch {
      setRows(previous);
    }
  }

  const today = toDateKey(new Date().toISOString());

  return (
    <div className="grid gap-5 xl:grid-cols-[1fr_20rem]">
      <div className="overflow-hidden rounded-xl border border-slate-200 dark:border-border">
        <div className="flex items-center justify-between border-b border-slate-200 p-3 dark:border-border">
          <div className="flex items-center gap-2">
            <button type="button" aria-label="Previous month" disabled={loading} onClick={() => changeMonth(-1)} className="grid size-9 place-items-center rounded-lg text-slate-600 hover:bg-slate-100 disabled:opacity-40 dark:text-muted-foreground dark:hover:bg-muted">
              <ChevronLeft aria-hidden className="size-4" />
            </button>
            <h2 className="w-40 text-center text-sm font-bold text-slate-900 dark:text-foreground">{monthLabel(monthCursor)}</h2>
            <button type="button" aria-label="Next month" disabled={loading} onClick={() => changeMonth(1)} className="grid size-9 place-items-center rounded-lg text-slate-600 hover:bg-slate-100 disabled:opacity-40 dark:text-muted-foreground dark:hover:bg-muted">
              <ChevronRight aria-hidden className="size-4" />
            </button>
          </div>
          {canManage && (
            <button type="button" onClick={() => openCreate(today)} className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-teal-600 px-3 text-xs font-bold text-white hover:bg-teal-700">
              <Plus aria-hidden className="size-4" />
              Add activity
            </button>
          )}
        </div>
        <div className="grid grid-cols-7 border-b border-slate-200 text-center text-[11px] font-bold text-slate-500 dark:border-border dark:text-muted-foreground">
          {WEEKDAYS.map((day) => <div key={day} className="p-2">{day}</div>)}
        </div>
        <div className="grid grid-cols-7">
          {gridDays.map((date) => {
            const key = toDateKey(date.toISOString());
            const dayRows = byDay.get(key) ?? [];
            const inMonth = date.getMonth() === monthCursor.getMonth();
            return (
              <button
                key={key}
                type="button"
                onClick={() => openCreate(key)}
                disabled={!canManage}
                className={cn(
                  "flex min-h-24 flex-col gap-1 border-b border-r border-slate-100 p-1.5 text-left transition-colors hover:bg-slate-50 disabled:cursor-default dark:border-border dark:hover:bg-muted/40",
                  !inMonth && "text-slate-300 dark:text-muted-foreground/40",
                )}
              >
                <span className={cn("grid size-6 place-items-center rounded-full text-xs font-semibold", key === today && "bg-teal-600 text-white")}>{date.getDate()}</span>
                <div className="flex flex-col gap-0.5">
                  {dayRows.slice(0, 3).map((row) => (
                    <span
                      key={row.id}
                      role="button"
                      tabIndex={0}
                      onClick={(event) => { event.stopPropagation(); openEdit(row); }}
                      onKeyDown={(event) => { if (event.key === "Enter") { event.stopPropagation(); openEdit(row); } }}
                      className={cn("flex items-center gap-1 truncate rounded px-1 py-0.5 text-[10px] font-medium text-slate-700 hover:bg-slate-100 dark:text-foreground dark:hover:bg-muted", row.status === "done" && "text-slate-400 line-through")}
                    >
                      <span aria-hidden className={cn("size-1.5 shrink-0 rounded-full", STATUS_DOT[row.status])} />
                      {row.title}
                    </span>
                  ))}
                  {dayRows.length > 3 && <span className="text-[10px] text-slate-400">+{dayRows.length - 3} more</span>}
                </div>
              </button>
            );
          })}
        </div>
      </div>

      <div className="rounded-xl border border-slate-200 p-4 dark:border-border">
        <div className="mb-3 flex items-center gap-2">
          <CalendarClock aria-hidden className="size-4 text-teal-700" />
          <h3 className="text-sm font-bold text-slate-900 dark:text-foreground">Upcoming</h3>
        </div>
        {upcoming.length === 0 ? (
          <p className="text-sm text-slate-500 dark:text-muted-foreground">Nothing scheduled.</p>
        ) : (
          <ul className="space-y-2">
            {upcoming.map((row) => (
              <li key={row.id}>
                <button type="button" onClick={() => openEdit(row)} className="w-full rounded-lg border border-slate-200 p-2.5 text-left transition-colors hover:bg-slate-50 dark:border-border dark:hover:bg-muted/40">
                  <div className="flex items-start justify-between gap-2">
                    <p className="min-w-0 flex-1 truncate text-sm font-semibold text-slate-800 dark:text-foreground">{row.title}</p>
                    <StatusBadge value={row.status} />
                  </div>
                  <p className="mt-1 text-xs text-slate-500 dark:text-muted-foreground">
                    {TYPE_LABEL[row.activityType]} · {new Date(row.startsAt).toLocaleDateString(undefined, { month: "short", day: "numeric" })}
                    {!row.allDay && ` · ${new Date(row.startsAt).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })}`}
                    {row.assignedToName && ` · ${row.assignedToName}`}
                  </p>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <AdminModal open={mode !== null} onClose={close} title={mode === "edit" ? "Edit activity" : "Add activity"} description={formDate ?? undefined}>
        <form onSubmit={submit} className="space-y-4 p-5">
          <AdminField label="Title" required>
            <input required disabled={!canManage} className={adminFieldClass} value={form.title} onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))} placeholder="KYC review call, property visit, staff sync…" />
          </AdminField>
          <div className="grid gap-4 sm:grid-cols-2">
            <AdminField label="Type">
              <select disabled={!canManage} className={adminFieldClass} value={form.activityType} onChange={(e) => setForm((f) => ({ ...f, activityType: e.target.value as ActivityType }))}>
                {ACTIVITY_TYPES.map((type) => <option key={type} value={type}>{TYPE_LABEL[type]}</option>)}
              </select>
            </AdminField>
            <AdminField label="Status">
              <select disabled={!canManage} className={adminFieldClass} value={form.status} onChange={(e) => setForm((f) => ({ ...f, status: e.target.value as ActivityStatus }))}>
                {ACTIVITY_STATUSES.map((status) => <option key={status} value={status}>{status.replaceAll("_", " ")}</option>)}
              </select>
            </AdminField>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <AdminField label="Time">
              <input type="time" disabled={!canManage || form.allDay} className={adminFieldClass} value={form.time} onChange={(e) => setForm((f) => ({ ...f, time: e.target.value }))} />
            </AdminField>
            <AdminField label="Assign to">
              <select disabled={!canManage} className={adminFieldClass} value={form.assignedTo} onChange={(e) => setForm((f) => ({ ...f, assignedTo: e.target.value }))}>
                <option value="">Unassigned</option>
                {assignees.map((person) => <option key={person.id} value={person.id}>{person.name ?? person.email ?? person.id.slice(0, 8)}</option>)}
              </select>
            </AdminField>
          </div>
          <label className="flex items-center gap-2 text-sm font-semibold text-slate-700 dark:text-foreground">
            <input type="checkbox" disabled={!canManage} checked={form.allDay} onChange={(e) => setForm((f) => ({ ...f, allDay: e.target.checked }))} />
            All-day
          </label>
          <AdminField label="Notes (optional)">
            <textarea disabled={!canManage} className={adminTextareaClass} value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} placeholder="Any extra detail" />
          </AdminField>
          {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
          <div className="flex items-center justify-between gap-2 border-t border-slate-100 pt-4 dark:border-border">
            {mode === "edit" && canManage ? (
              <button type="button" onClick={() => selected && void removeActivity(selected.id)} className="inline-flex h-9 items-center gap-1.5 rounded-lg px-3 text-xs font-bold text-red-700 hover:bg-red-50 dark:hover:bg-red-950">
                <Trash2 aria-hidden className="size-3.5" />
                Delete
              </button>
            ) : <span />}
            <div className="flex gap-2">
              <button type="button" onClick={close} className="inline-flex h-9 items-center rounded-lg border border-slate-200 px-3 text-xs font-bold text-slate-700 hover:bg-slate-50 dark:border-border dark:text-foreground dark:hover:bg-muted">Close</button>
              {canManage && <button type="submit" disabled={pending || !form.title.trim()} className="inline-flex h-9 items-center rounded-lg bg-teal-600 px-4 text-xs font-bold text-white hover:bg-teal-700 disabled:opacity-50">{pending ? "Saving…" : "Save"}</button>}
            </div>
          </div>
        </form>
      </AdminModal>
    </div>
  );
}
