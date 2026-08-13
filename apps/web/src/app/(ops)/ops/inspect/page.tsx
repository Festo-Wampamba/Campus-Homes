import type { Metadata } from "next";
import { ClipboardList } from "lucide-react";

import { EmptyState } from "@/components/empty-state";
import { getMyVisitHistory, getMyVisits } from "@/lib/ops";
import { MyVisitsList, ReviewedVisitsList } from "./my-visits-list";

export const metadata: Metadata = { title: "My visits" };

export default async function MyVisitsPage() {
  const [visits, history] = await Promise.all([getMyVisits(), getMyVisitHistory()]);

  return (
    <>
      <h1 className="text-2xl">My visits</h1>
      {visits.length === 0 ? (
        <div className="mt-6">
          <EmptyState
            icon={ClipboardList}
            title="No visits assigned"
            body="Scheduled verification visits appear here. Tap one to run the 6-component checklist — it works offline too."
          />
        </div>
      ) : (
        <MyVisitsList visits={visits} />
      )}

      {history.length > 0 && (
        <>
          <h2 className="mt-8 text-lg font-semibold text-foreground">Reviewed</h2>
          <ReviewedVisitsList visits={history} />
        </>
      )}
    </>
  );
}
