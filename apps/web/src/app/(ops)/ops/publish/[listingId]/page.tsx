import type { Metadata } from "next";

import { PublishListingForm } from "./publish-listing-form";

export const metadata: Metadata = { title: "Publish listing" };

export default async function PublishListingPage({
  params,
}: {
  params: Promise<{ listingId: string }>;
}) {
  const { listingId } = await params;
  return (
    <>
      <h1 className="text-2xl">Publish listing</h1>
      <div className="mt-6 max-w-2xl">
        <PublishListingForm listingId={listingId} />
      </div>
    </>
  );
}
