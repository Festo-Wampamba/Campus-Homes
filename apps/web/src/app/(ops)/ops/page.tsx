import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ClipboardCheck } from "lucide-react";
import type { OpsQueueRow } from "@campushomes/shared";

import { Card, CardContent } from "@/components/ui/card";
import { EmptyState } from "@/components/empty-state";
import { StatusChip } from "@/components/status-chip";
import { getServerSession } from "@/lib/session";
import { getQueue } from "@/lib/ops";

export const metadata: Metadata = { title: "Verification queue" };

function ageTone(ageHours: number): "success" | "warning" | "destructive" {
  if (ageHours > 96) return "destructive";
  if (ageHours > 48) return "warning";
  return "success";
}

function visitStageLabel(row: OpsQueueRow): string | null {
  if (row.visit_id === null) return null;
  if (row.result === "passed") return "Awaiting your approval";
  if (row.result === "pending") return row.scheduled_at ? "Visit scheduled" : "Not yet scheduled";
  return null;
}

function QueueRow({ row }: { row: OpsQueueRow }) {
  const hasVisit = row.visit_id !== null;
  const stageLabel = visitStageLabel(row);
  return (
    <Card>
      <CardContent className="flex flex-wrap items-center justify-between gap-3 p-5">
        <div>
          <p className="font-semibold text-foreground">{row.name}</p>
          <p className="text-sm text-muted-foreground">{row.street_address}</p>
        </div>
        <div className="flex items-center gap-3">
          {stageLabel && (
            <StatusChip tone={row.result === "passed" ? "warning" : "neutral"}>
              {stageLabel}
            </StatusChip>
          )}
          <StatusChip tone={ageTone(row.age_hours)}>{Math.round(row.age_hours)}h old</StatusChip>
          <Link
            href={
              hasVisit ? `/ops/visits/${row.visit_id}` : `/ops/visits/schedule?propertyId=${row.id}`
            }
            className="inline-flex h-9 items-center rounded-md bg-primary px-3 text-sm font-semibold text-primary-foreground shadow-xs transition-colors duration-150 hover:bg-teal-700"
          >
            {hasVisit ? "View" : "Schedule"}
          </Link>
        </div>
      </CardContent>
    </Card>
  );
}

export default async function OpsQueuePage() {
  const session = await getServerSession();
  if (session?.user.role === "ops_inspector") {
    redirect("/ops/inspect");
  }

  const queue = await getQueue();

  return (
    <>
      <h1 className="text-2xl">Verification queue</h1>
      {queue.length === 0 ? (
        <div className="mt-6">
          <EmptyState
            icon={ClipboardCheck}
            title="The queue is clear"
            body="New verification requests appear here with their SLA age. Leads schedule visits; inspectors run the 6-component checklist on site — offline if they have to."
          />
        </div>
      ) : (
        <div className="mt-6 space-y-3">
          {queue.map((row) => (
            <QueueRow key={row.id} row={row} />
          ))}
        </div>
      )}
    </>
  );
}
