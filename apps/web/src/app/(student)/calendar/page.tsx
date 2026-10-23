import type { Metadata } from "next";

import { CalendarView } from "@/components/calendar/calendar-view";
import { getCalendarEvents } from "@/lib/calendar";

export const metadata: Metadata = { title: "Calendar" };

export default async function StudentCalendarPage() {
  const now = new Date();
  const from = new Date(now.getFullYear(), now.getMonth() - 1, 1).toISOString();
  const to = new Date(now.getFullYear(), now.getMonth() + 2, 0).toISOString();
  const events = await getCalendarEvents(from, to);

  return (
    <>
      <p className="text-xs font-bold uppercase tracking-[0.16em] text-[#ae5528]">Plan your move</p>
      <h1 className="ch-student-page__title mt-3">Calendar</h1>
      <p className="ch-student-page__lede">
        Reminders, visit days, and deadlines you&apos;ve set for yourself.
      </p>
      <div className="mt-6">
        <CalendarView initialEvents={events} />
      </div>
    </>
  );
}
