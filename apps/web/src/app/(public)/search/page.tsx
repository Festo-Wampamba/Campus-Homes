import type { Metadata } from "next";
import { Suspense } from "react";

import { SearchClient } from "./search-client";

export const metadata: Metadata = {
  title: "Search hostels near Makerere",
  description: "Search inspected student hostels near Makerere University on a map. Filter by room type, price and gender arrangement.",
  alternates: { canonical: "/search" },
};

export default function SearchPage() {
  return (
    <Suspense>
      <SearchClient />
    </Suspense>
  );
}
