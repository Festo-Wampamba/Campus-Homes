import type { Metadata } from "next";

import { getInspectors } from "@/lib/ops";
import { ScheduleVisitForm } from "./schedule-visit-form";

export const metadata: Metadata = { title: "Schedule visit" };

export default async function ScheduleVisitPage({
  searchParams,
}: {
  searchParams: Promise<{ propertyId?: string }>;
}) {
  const { propertyId } = await searchParams;
  const inspectors = await getInspectors();

  return (
    <>
      <h1 className="text-2xl">Schedule a visit</h1>
      <div className="mt-6 max-w-md">
        <ScheduleVisitForm propertyId={propertyId ?? ""} inspectors={inspectors} />
      </div>
    </>
  );
}
