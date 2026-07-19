import type { Metadata } from "next";

import { RecentlyViewedClient } from "./recently-viewed-client";

export const metadata: Metadata = { title: "Recently viewed" };

export default function RecentlyViewedPage() {
  return (
    <>
      <h1 className="text-2xl">Recently viewed</h1>
      <RecentlyViewedClient />
    </>
  );
}
