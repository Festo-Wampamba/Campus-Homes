import type { CalendarEvent } from "@campushomes/shared";

import { apiServer } from "@/lib/server-api";

export function getCalendarEvents(from: string, to: string): Promise<CalendarEvent[]> {
  return apiServer<CalendarEvent[]>(`/calendar?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`).then(
    (rows) => rows ?? [],
  );
}
