import { Injectable, NotFoundException } from '@nestjs/common';
import { and, asc, eq, gte, lte } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';

import type { CreateActivityInput, UpdateActivityInput } from '@campushomes/shared';

import { RlsDb } from '../../db/db.module';
import type { RlsContext } from '../../db/rls-context';
import { activities, users } from '../../db/schema';

const SERVICE_CTX: RlsContext = {
  userId: '00000000-0000-0000-0000-000000000000',
  role: 'service_role',
};

const assignee = alias(users, 'assignee');
const creator = alias(users, 'creator');

// activities is svc_all-only under RLS (0017) — every query runs as
// service_role, same posture as StaffService. PermissionsGuard on the
// controller (activities.manage/activities.read) is the real authorization
// boundary, not row scoping.
@Injectable()
export class AdminActivitiesService {
  constructor(private readonly rlsDb: RlsDb) {}

  private selection() {
    return {
      id: activities.id,
      title: activities.title,
      description: activities.description,
      activityType: activities.activityType,
      status: activities.status,
      startsAt: activities.startsAt,
      endsAt: activities.endsAt,
      allDay: activities.allDay,
      assignedTo: activities.assignedTo,
      assignedToName: assignee.name,
      createdBy: activities.createdBy,
      createdByName: creator.name,
      createdAt: activities.createdAt,
      updatedAt: activities.updatedAt,
    };
  }

  list(from?: string, to?: string) {
    return this.rlsDb.run(SERVICE_CTX, (db) =>
      db
        .select(this.selection())
        .from(activities)
        .leftJoin(assignee, eq(assignee.id, activities.assignedTo))
        .leftJoin(creator, eq(creator.id, activities.createdBy))
        .where(
          and(
            from ? gte(activities.startsAt, new Date(from)) : undefined,
            to ? lte(activities.startsAt, new Date(to)) : undefined,
          ),
        )
        .orderBy(asc(activities.startsAt)),
    );
  }

  create(ctx: RlsContext, input: CreateActivityInput) {
    return this.rlsDb.run(SERVICE_CTX, async (db) => {
      const [row] = await db
        .insert(activities)
        .values({
          title: input.title,
          description: input.description ?? null,
          activityType: input.activityType,
          status: input.status,
          startsAt: new Date(input.startsAt),
          endsAt: input.endsAt ? new Date(input.endsAt) : null,
          allDay: input.allDay,
          assignedTo: input.assignedTo ?? null,
          createdBy: ctx.userId,
        })
        .returning({ id: activities.id });
      if (!row) throw new NotFoundException('Activity not found');
      // Same-tx read: calling this.detail() here would open a second pooled
      // connection whose transaction cannot see this uncommitted insert.
      const [created] = await db
        .select(this.selection())
        .from(activities)
        .leftJoin(assignee, eq(assignee.id, activities.assignedTo))
        .leftJoin(creator, eq(creator.id, activities.createdBy))
        .where(eq(activities.id, row.id));
      if (!created) throw new NotFoundException('Activity not found');
      return created;
    });
  }

  async update(id: string, input: UpdateActivityInput) {
    return this.rlsDb.run(SERVICE_CTX, async (db) => {
      const [row] = await db
        .update(activities)
        .set({
          ...(input.title !== undefined ? { title: input.title } : {}),
          ...(input.description !== undefined ? { description: input.description } : {}),
          ...(input.activityType !== undefined ? { activityType: input.activityType } : {}),
          ...(input.status !== undefined ? { status: input.status } : {}),
          ...(input.startsAt !== undefined ? { startsAt: new Date(input.startsAt) } : {}),
          ...(input.endsAt !== undefined ? { endsAt: input.endsAt ? new Date(input.endsAt) : null } : {}),
          ...(input.allDay !== undefined ? { allDay: input.allDay } : {}),
          ...(input.assignedTo !== undefined ? { assignedTo: input.assignedTo } : {}),
          updatedAt: new Date(),
        })
        .where(eq(activities.id, id))
        .returning({ id: activities.id });
      if (!row) throw new NotFoundException('Activity not found');
      // Same-tx read — see note in create().
      const [updated] = await db
        .select(this.selection())
        .from(activities)
        .leftJoin(assignee, eq(assignee.id, activities.assignedTo))
        .leftJoin(creator, eq(creator.id, activities.createdBy))
        .where(eq(activities.id, row.id));
      if (!updated) throw new NotFoundException('Activity not found');
      return updated;
    });
  }

  private async detail(id: string) {
    return this.rlsDb.run(SERVICE_CTX, async (db) => {
      const [row] = await db
        .select(this.selection())
        .from(activities)
        .leftJoin(assignee, eq(assignee.id, activities.assignedTo))
        .leftJoin(creator, eq(creator.id, activities.createdBy))
        .where(eq(activities.id, id));
      return row;
    });
  }

  async remove(id: string) {
    await this.rlsDb.run(SERVICE_CTX, async (db) => {
      const [row] = await db.delete(activities).where(eq(activities.id, id)).returning({ id: activities.id });
      if (!row) throw new NotFoundException('Activity not found');
    });
    return { deleted: true };
  }
}
