import type { Metadata } from "next";

import { getSavedListings } from "@/lib/saved-listings";
import { RecentlyViewedClient } from "./recently-viewed-client";

export const metadata: Metadata = { title: "Recently viewed" };

export default async function RecentlyViewedPage() {
  const saved = await getSavedListings();
  return (
    <>
      <h1 className="text-2xl">Recently viewed</h1>
      <RecentlyViewedClient savedIds={saved.map(row => row.id)} />
    </>
  );
}
