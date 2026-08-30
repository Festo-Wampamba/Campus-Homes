import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ClipboardCheck, TriangleAlert } from "lucide-react";
import type { OpsQueueRow } from "@campushomes/shared";

import { Card, CardContent } from "@/components/ui/card";
import { EmptyState } from "@/components/empty-state";
import { StatusChip } from "@/components/status-chip";
import { getServerSession } from "@/lib/session";
import { getQueue } from "@/lib/ops";

export const metadata: Metadata = { title: "Properties waiting verification" };

function ageTone(ageHours: number): "success" | "warning" | "destructive" {
  if (ageHours > 96) return "destructive";
  if (ageHours > 48) return "warning";
  return "success";
}

function visitStageLabel(row: OpsQueueRow): string | null {
  if (row.visit_id === null) return null;
  if (row.result === "passed") return "Awaiting your approval";
  if (row.result === "failed") return "Visit failed — schedule a re-visit";
  if (row.result === "pending") return row.scheduled_at ? "Visit scheduled" : "Not yet scheduled";
  return null;
}

function stageTone(row: OpsQueueRow): "warning" | "destructive" | "neutral" {
  if (row.result === "passed") return "warning";
  if (row.result === "failed") return "destructive";
  return "neutral";
}

function QueueRow({ row }: { row: OpsQueueRow }) {
  const hasVisit = row.visit_id !== null;
  const stageLabel = visitStageLabel(row);
  // A failed visit is a dead end — it can never be approved, so the useful
  // action is scheduling a fresh one, not re-opening the failed checklist.
  const needsReschedule = row.result === "failed";
  return (
    <Card>
      <CardContent className="flex flex-wrap items-center justify-between gap-3 p-5">
        <div>
          <p className="font-semibold text-foreground">{row.name}</p>
          <p className="text-sm text-muted-foreground">{row.street_address}</p>
        </div>
        <div className="flex items-center gap-3">
          {row.landlord_kyc_status !== "verified" && (
            <StatusChip tone={row.landlord_kyc_status === "rejected" ? "destructive" : "warning"}>
              Landlord {row.landlord_kyc_status === "rejected" ? "KYC rejected" : "not KYC-verified"}
            </StatusChip>
          )}
          {stageLabel && <StatusChip tone={stageTone(row)}>{stageLabel}</StatusChip>}
          <StatusChip tone={ageTone(row.age_hours)}>{Math.round(row.age_hours)}h old</StatusChip>
          {needsReschedule && (
            <Link
              href={`/ops/visits/${row.visit_id}`}
              className="inline-flex h-9 items-center rounded-md border border-input px-3 text-sm font-semibold text-foreground transition-colors hover:bg-muted"
            >
              View
            </Link>
          )}
          <Link
            href={
              hasVisit && !needsReschedule
                ? `/ops/visits/${row.visit_id}`
                : `/ops/visits/schedule?propertyId=${row.id}`
            }
            className="inline-flex h-9 items-center rounded-md bg-primary px-3 text-sm font-semibold text-primary-foreground shadow-xs transition-colors duration-150 hover:bg-teal-700"
          >
            {hasVisit && !needsReschedule ? "View" : "Schedule"}
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

  let queue: OpsQueueRow[];
  let loadFailed = false;
  try {
    queue = await getQueue();
  } catch {
    // Deliberately not falling back to []: "the API didn't respond" and
    // "there's nothing to approve" must never render identically here — a
    // lead reading a calm "queue is clear" during a transient backend blip
    // has no reason to suspect anything's wrong and just moves on.
    queue = [];
    loadFailed = true;
  }

  return (
    <>
      <h1 className="text-2xl">Properties waiting verification</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Properties a landlord has submitted, waiting for an inspection visit and a decision.
      </p>
      {loadFailed ? (
        <div className="mt-6">
          <div className="flex flex-col items-center rounded-lg border border-dashed border-destructive/40 px-6 py-12 text-center">
            <span className="flex size-12 items-center justify-center rounded-full bg-destructive/10 text-destructive">
              <TriangleAlert aria-hidden className="size-5" />
            </span>
            <h2 className="mt-4 text-lg">Couldn&apos;t load the queue</h2>
            <p className="mt-1.5 max-w-sm text-base text-muted-foreground">
              The API didn&apos;t respond — this is not the same as an empty queue. Refresh in a
              moment; if it keeps happening, check whether the API is up.
            </p>
          </div>
        </div>
      ) : queue.length === 0 ? (
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
