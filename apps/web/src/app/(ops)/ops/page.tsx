import type { Metadata } from "next";
import { ClipboardCheck } from "lucide-react";

import { EmptyState } from "@/components/empty-state";

export const metadata: Metadata = { title: "Verification queue" };

// Phase 5 wires this to GET /ops/queue with SLA ages + catchment filters.
export default function OpsQueuePage() {
  return (
    <>
      <h1 className="text-2xl">Verification queue</h1>
      <div className="mt-6">
        <EmptyState
          icon={ClipboardCheck}
          title="The queue is clear"
          body="New verification requests appear here with their SLA age. Leads schedule visits; inspectors run the 6-component checklist on site — offline if they have to."
        />
      </div>
    </>
  );
}
