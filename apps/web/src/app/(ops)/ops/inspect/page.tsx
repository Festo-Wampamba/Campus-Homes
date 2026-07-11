import type { Metadata } from "next";
import { ClipboardList } from "lucide-react";

import { EmptyState } from "@/components/empty-state";
import { getMyVisits } from "@/lib/ops";
import { MyVisitsList } from "./my-visits-list";

export const metadata: Metadata = { title: "My visits" };

export default async function MyVisitsPage() {
  const visits = await getMyVisits();

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
    </>
  );
}
