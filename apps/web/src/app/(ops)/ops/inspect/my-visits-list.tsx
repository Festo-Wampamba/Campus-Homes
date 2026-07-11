"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import type { OpsVisitMine } from "@campushomes/shared";

import { Card, CardContent } from "@/components/ui/card";
import { StatusChip } from "@/components/status-chip";
import { getDraft, type SyncStatus } from "@/lib/ops/inspection-db";

const STATUS_LABEL: Record<SyncStatus, string> = {
  draft: "In progress",
  queued: "Queued — will sync",
  syncing: "Syncing…",
  synced: "Synced",
  failed: "Sync failed",
};

const STATUS_TONE: Record<SyncStatus, "success" | "warning" | "destructive" | "neutral"> = {
  draft: "neutral",
  queued: "warning",
  syncing: "warning",
  synced: "success",
  failed: "destructive",
};

function VisitRow({ visit }: { visit: OpsVisitMine }) {
  const [localStatus, setLocalStatus] = useState<SyncStatus | null>(null);

  useEffect(() => {
    let cancelled = false;
    getDraft(visit.visit_id).then((draft) => {
      if (!cancelled) setLocalStatus(draft?.syncStatus ?? null);
    });
    return () => {
      cancelled = true;
    };
  }, [visit.visit_id]);

  return (
    <Link href={`/ops/inspect/${visit.visit_id}`}>
      <Card className="transition-colors hover:bg-muted">
        <CardContent className="flex items-center justify-between gap-3 p-5">
          <div>
            <p className="font-semibold text-foreground">{visit.property_name}</p>
            <p className="text-sm text-muted-foreground">{visit.street_address}</p>
          </div>
          {localStatus && (
            <StatusChip tone={STATUS_TONE[localStatus]}>{STATUS_LABEL[localStatus]}</StatusChip>
          )}
        </CardContent>
      </Card>
    </Link>
  );
}

export function MyVisitsList({ visits }: { visits: OpsVisitMine[] }) {
  return (
    <div className="mt-6 space-y-3">
      {visits.map((visit) => (
        <VisitRow key={visit.visit_id} visit={visit} />
      ))}
    </div>
  );
}
