import type { Metadata } from "next";
import { redirect } from "next/navigation";
import type { OpsVisitMine } from "@campushomes/shared";

import { apiServer } from "@/lib/server-api";
import { getVisitDetail } from "@/lib/ops";
import { InspectionForm } from "./inspection-form";

export const metadata: Metadata = { title: "Inspection" };

export default async function InspectVisitPage({
  params,
}: {
  params: Promise<{ visitId: string }>;
}) {
  const { visitId } = await params;
  const visits = (await apiServer<OpsVisitMine[]>("/ops/visits/mine")) ?? [];
  const visit = visits.find((v) => v.visit_id === visitId);
  if (!visit) {
    // Not in the pending queue — either already approved (visits/mine only
    // holds not-yet-approved rows, see ops.service.ts myVisits()) or not this
    // inspector's visit at all. The review page fetches server truth
    // directly and 404s itself if it isn't theirs either.
    redirect(`/ops/visits/${visitId}`);
  }

  // Server truth for this still-pending visit — lets the checklist form
  // reconcile against an already-synced submission (e.g. from another
  // device) instead of silently starting a blank draft over it.
  const serverVisit = await getVisitDetail(visitId);

  return (
    <>
      <h1 className="text-2xl">{visit.property_name}</h1>
      <p className="text-sm text-muted-foreground">{visit.street_address}</p>
      <div className="mt-6">
        <InspectionForm visitId={visitId} serverVisit={serverVisit} />
      </div>
    </>
  );
}
