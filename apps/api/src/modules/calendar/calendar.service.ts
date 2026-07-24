import { Injectable, NotFoundException } from '@nestjs/common';
import { and, asc, eq, gte, lte } from 'drizzle-orm';

import type { CreateCalendarEventInput, UpdateCalendarEventInput } from '@campushomes/shared';

import { RlsDb } from '../../db/db.module';
import type { RlsContext } from '../../db/rls-context';
import { calendarEvents } from '../../db/schema';

@Injectable()
export class CalendarService {
  constructor(private readonly rlsDb: RlsDb) {}

  // RLS (calendar_events_self) independently scopes every row to
  // user_id = app_user_id() — the explicit eq() below is just so this query
  // only ever returns this user's rows, not a defense boundary by itself.
  list(ctx: RlsContext, from?: string, to?: string) {
    return this.rlsDb.run(ctx, (db) =>
      db
        .select()
        .from(calendarEvents)
        .where(
          and(
            eq(calendarEvents.userId, ctx.userId),
            from ? gte(calendarEvents.startsAt, new Date(from)) : undefined,
            to ? lte(calendarEvents.startsAt, new Date(to)) : undefined,
          ),
        )
        .orderBy(asc(calendarEvents.startsAt)),
    );
  }

  create(ctx: RlsContext, input: CreateCalendarEventInput) {
    return this.rlsDb.run(ctx, async (db) => {
      const [row] = await db
        .insert(calendarEvents)
        .values({
          userId: ctx.userId,
          title: input.title,
          description: input.description ?? null,
          eventType: input.eventType,
          startsAt: new Date(input.startsAt),
          endsAt: input.endsAt ? new Date(input.endsAt) : null,
          allDay: input.allDay,
        })
        .returning();
      return row;
    });
  }

  async update(ctx: RlsContext, id: string, input: UpdateCalendarEventInput) {
    return this.rlsDb.run(ctx, async (db) => {
      const [row] = await db
        .update(calendarEvents)
        .set({
          ...(input.title !== undefined ? { title: input.title } : {}),
          ...(input.description !== undefined ? { description: input.description } : {}),
          ...(input.eventType !== undefined ? { eventType: input.eventType } : {}),
          ...(input.startsAt !== undefined ? { startsAt: new Date(input.startsAt) } : {}),
          ...(input.endsAt !== undefined ? { endsAt: input.endsAt ? new Date(input.endsAt) : null } : {}),
          ...(input.allDay !== undefined ? { allDay: input.allDay } : {}),
          ...(input.done !== undefined ? { done: input.done } : {}),
          updatedAt: new Date(),
        })
        .where(and(eq(calendarEvents.id, id), eq(calendarEvents.userId, ctx.userId)))
        .returning();
      if (!row) throw new NotFoundException('Calendar event not found');
      return row;
    });
  }

  async remove(ctx: RlsContext, id: string) {
    await this.rlsDb.run(ctx, async (db) => {
      const [row] = await db
        .delete(calendarEvents)
        .where(and(eq(calendarEvents.id, id), eq(calendarEvents.userId, ctx.userId)))
        .returning({ id: calendarEvents.id });
      if (!row) throw new NotFoundException('Calendar event not found');
    });
    return { deleted: true };
  }
}
