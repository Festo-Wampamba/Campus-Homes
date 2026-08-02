import type { Metadata } from "next";
import { Star } from "lucide-react";

import { EmptyState } from "@/components/empty-state";

export const metadata: Metadata = { title: "Reviews" };

export default function LandlordReviewsPage() {
  return (
    <>
      <h1 className="text-2xl">Reviews</h1>
      <p className="mt-1 text-sm text-muted-foreground">See what students say about your properties.</p>

      <div className="mt-6">
        <EmptyState
          icon={Star}
          title="Per-property reviews are coming"
          body="Students can already leave a review after a fulfilled stay. Landlord-facing review browsing and replies land in a future update."
        />
      </div>
    </>
  );
}
