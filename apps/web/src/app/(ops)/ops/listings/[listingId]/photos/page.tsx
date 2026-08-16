import type { Metadata } from "next";

import { ListingPhotosManager } from "./listing-photos-manager";

export const metadata: Metadata = { title: "Listing photos" };

export default async function ListingPhotosPage({
  params,
}: {
  params: Promise<{ listingId: string }>;
}) {
  const { listingId } = await params;
  return (
    <>
      <h1 className="text-2xl">Listing photos</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Add verification photos any time — for a visit where the inspector
        didn&apos;t stage any, or to add more later.
      </p>
      <div className="mt-6 max-w-3xl">
        <ListingPhotosManager listingId={listingId} />
      </div>
    </>
  );
}
