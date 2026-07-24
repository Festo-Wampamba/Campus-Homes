import type { Metadata } from "next";
import type { Activity } from "@campushomes/shared";

import { PageHeader, SectionCard } from "@/components/admin/admin-ui";
import { apiServer } from "@/lib/server-api";
import { ActivitiesManager } from "./activities-manager";

export const metadata: Metadata = { title: "Activities" };

interface StaffRow {
  id: string;
  name: string | null;
  email: string | null;
}

function monthWindow() {
  const now = new Date();
  const from = new Date(now.getFullYear(), now.getMonth() - 1, 1).toISOString();
  const to = new Date(now.getFullYear(), now.getMonth() + 2, 0).toISOString();
  return { from, to };
}

export default async function ActivitiesPage() {
  const { from, to } = monthWindow();
  const [rows, assignees, access] = await Promise.all([
    apiServer<Activity[]>(`/admin/activities?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`),
    apiServer<StaffRow[]>("/admin/activities/assignees"),
    apiServer<{ permissions: string[] }>("/admin/access/me"),
  ]);
  const canManage = (access?.permissions ?? []).includes("activities.manage");

  return (
    <>
      <PageHeader
        eyebrow="Operations"
        title="Activities"
        description="Assign, schedule, and track platform work across the ops and admin team."
      />
      <SectionCard
        title="Activity calendar"
        description={canManage ? "Create activities and assign them to any staff member." : "Read-only — you don't hold activities.manage."}
      >
        <div className="p-4 sm:p-5">
          <ActivitiesManager initialActivities={rows ?? []} assignees={assignees ?? []} canManage={canManage} />
        </div>
      </SectionCard>
    </>
  );
}
