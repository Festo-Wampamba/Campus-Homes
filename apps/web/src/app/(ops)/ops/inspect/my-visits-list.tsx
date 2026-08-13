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

  // The local IndexedDB draft only exists on the device that submitted it —
  // a different device (or this one after clearing site data) has nothing
  // local even though the server already has the real result. Fall back to
  // server truth so the checklist doesn't look un-submitted when it isn't.
  const tone = localStatus
    ? STATUS_TONE[localStatus]
    : visit.result === "passed"
      ? "success"
      : visit.result === "failed"
        ? "destructive"
        : null;
  const label = localStatus
    ? STATUS_LABEL[localStatus]
    : visit.result === "passed" || visit.result === "failed"
      ? "Synced"
      : null;

  return (
    <Link href={`/ops/inspect/${visit.visit_id}`}>
      <Card className="transition-colors hover:bg-muted">
        <CardContent className="flex items-center justify-between gap-3 p-5">
          <div>
            <p className="font-semibold text-foreground">{visit.property_name}</p>
            <p className="text-sm text-muted-foreground">{visit.street_address}</p>
          </div>
          {tone && label && <StatusChip tone={tone}>{label}</StatusChip>}
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

// The reviewed half — visits the lead has already approved, so they're gone
// from MyVisitsList's queue but should still be visible somewhere, not just
// silently disappear from the inspector's world. Links into the same
// full-detail review page the lead uses (/ops/visits/[id], now readable by
// the assigned inspector too — see ops.controller.ts visitDetail).
export function ReviewedVisitsList({ visits }: { visits: OpsVisitMine[] }) {
  return (
    <div className="mt-3 space-y-3">
      {visits.map((visit) => (
        <Link key={visit.visit_id} href={`/ops/visits/${visit.visit_id}`}>
          <Card className="transition-colors hover:bg-muted">
            <CardContent className="flex items-center justify-between gap-3 p-5">
              <div>
                <p className="font-semibold text-foreground">{visit.property_name}</p>
                <p className="text-sm text-muted-foreground">{visit.street_address}</p>
              </div>
              <StatusChip tone="success">Approved</StatusChip>
            </CardContent>
          </Card>
        </Link>
      ))}
    </div>
  );
}
