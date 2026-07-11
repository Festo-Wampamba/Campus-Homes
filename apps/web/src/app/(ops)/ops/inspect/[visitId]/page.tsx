import type { Metadata } from "next";
import { notFound } from "next/navigation";
import type { OpsVisitMine } from "@campushomes/shared";

import { apiServer } from "@/lib/server-api";
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
    notFound();
  }

  return (
    <>
      <h1 className="text-2xl">{visit.property_name}</h1>
      <p className="text-sm text-muted-foreground">{visit.street_address}</p>
      <div className="mt-6">
        <InspectionForm visitId={visitId} />
      </div>
    </>
  );
}
