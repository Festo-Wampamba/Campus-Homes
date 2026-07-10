import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
import {
  VERIFICATION_CHECKLIST_COMPONENTS,
  type VerificationChecklistComponent,
} from "@campushomes/shared";

import { Card, CardContent } from "@/components/ui/card";
import { StatusChip } from "@/components/status-chip";
import { getPropertyListings, getVisitDetail } from "@/lib/ops";
import { ApproveVisitButton } from "./approve-visit-button";

export const metadata: Metadata = { title: "Visit review" };

const COMPONENT_LABEL: Record<VerificationChecklistComponent, string> = {
  location_gps: "Location & GPS",
  rooms_capacity: "Rooms & capacity",
  amenities: "Amenities",
  photos: "Photos match property",
  landlord_identity: "Landlord identity",
  safety: "Safety",
};

export default async function VisitDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const visit = await getVisitDetail(id);
  if (!visit) {
    notFound();
  }

  const listings = visit.approvedAt ? await getPropertyListings(visit.propertyId) : [];

  return (
    <>
      <h1 className="text-2xl">Visit review</h1>
      <div className="mt-6 space-y-3">
        <Card>
          <CardContent className="flex flex-wrap items-center justify-between gap-3 p-5">
            <div>
              <StatusChip
                tone={
                  visit.result === "passed"
                    ? "success"
                    : visit.result === "failed"
                      ? "destructive"
                      : "neutral"
                }
              >
                {visit.result}
              </StatusChip>
              {visit.visitGpsLat && visit.visitGpsLon && (
                <p className="mt-2 text-sm text-muted-foreground">
                  GPS {visit.visitGpsLat}, {visit.visitGpsLon}
                </p>
              )}
            </div>
            {visit.result === "passed" && !visit.approvedAt && (
              <ApproveVisitButton visitId={visit.id} />
            )}
            {visit.approvedAt && <StatusChip tone="success">Approved</StatusChip>}
          </CardContent>
        </Card>

        {VERIFICATION_CHECKLIST_COMPONENTS.map((component) => {
          const entry = visit.checklist[component];
          return (
            <Card key={component}>
              <CardContent className="p-5">
                <div className="flex items-center justify-between">
                  <p className="font-semibold text-foreground">{COMPONENT_LABEL[component]}</p>
                  {entry && (
                    <StatusChip tone={entry.passed ? "success" : "destructive"}>
                      {entry.passed ? "Pass" : "Fail"}
                    </StatusChip>
                  )}
                </div>
                {entry?.notes && (
                  <p className="mt-2 text-sm text-muted-foreground">{entry.notes}</p>
                )}
              </CardContent>
            </Card>
          );
        })}

        {visit.approvedAt && listings.length > 0 && (
          <Card>
            <CardContent className="flex items-center justify-between gap-3 p-5">
              <p className="text-sm text-muted-foreground">Ready to publish</p>
              <Link
                href={`/ops/publish/${listings[0].id}`}
                className="inline-flex h-9 items-center rounded-md bg-primary px-3 text-sm font-semibold text-primary-foreground shadow-xs transition-colors duration-150 hover:bg-teal-700"
              >
                Publish
              </Link>
            </CardContent>
          </Card>
        )}
      </div>
    </>
  );
}
