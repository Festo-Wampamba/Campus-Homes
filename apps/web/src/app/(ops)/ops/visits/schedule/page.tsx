import type { Metadata } from "next";

import { Building2 } from "lucide-react";

import { getInspectors, getQueue } from "@/lib/ops";
import { ScheduleVisitForm } from "./schedule-visit-form";

export const metadata: Metadata = { title: "Schedule visit" };

export default async function ScheduleVisitPage({
  searchParams,
}: {
  searchParams: Promise<{ propertyId?: string }>;
}) {
  const { propertyId } = await searchParams;
  const [inspectors, queue] = await Promise.all([getInspectors(), getQueue()]);
  const property = queue.find((row) => row.id === propertyId);

  return (
    <>
      <h1 className="text-2xl">Schedule a visit</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Choose who inspects the property and when. The inspector sees the visit in My visits.
      </p>
      <div className="mt-6 max-w-xl space-y-5">
        {property && (
          <div className="flex items-center gap-3 rounded-lg border border-border bg-card px-4 py-3">
            <span className="grid size-9 shrink-0 place-items-center rounded-md bg-teal-50 text-teal-700">
              <Building2 aria-hidden className="size-4" />
            </span>
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold">{property.name}</p>
              <p className="truncate text-xs text-muted-foreground">{property.street_address}</p>
            </div>
          </div>
        )}
        <ScheduleVisitForm propertyId={propertyId ?? ""} inspectors={inspectors} />
      </div>
    </>
  );
}
