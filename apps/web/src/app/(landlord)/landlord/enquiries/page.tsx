import type { Metadata } from "next";
import { MessageCircleQuestion } from "lucide-react";

import type { Inquiry } from "@campushomes/shared";

import { apiServer } from "@/lib/server-api";
import { EmptyState } from "@/components/empty-state";
import { LandlordEnquiriesList } from "./landlord-enquiries-list";

export const metadata: Metadata = { title: "Enquiries" };

export default async function LandlordEnquiriesPage() {
  const inquiries = (await apiServer<Inquiry[]>("/inquiries/landlord-inbox")) ?? [];

  return (
    <>
      <h1 className="text-2xl">Enquiries</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Questions and viewing requests from students, sent before they reserve.
      </p>

      {inquiries.length === 0 ? (
        <div className="mt-6">
          <EmptyState
            icon={MessageCircleQuestion}
            title="No enquiries yet"
            body="When a student asks about one of your listings, it appears here."
          />
        </div>
      ) : (
        <LandlordEnquiriesList initialInquiries={inquiries} />
      )}
    </>
  );
}
