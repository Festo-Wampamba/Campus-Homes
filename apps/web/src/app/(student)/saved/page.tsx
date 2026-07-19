import type { Metadata } from "next";
import Link from "next/link";
import { Heart } from "lucide-react";

import { EmptyState } from "@/components/empty-state";
import { getSavedListings } from "@/lib/saved-listings";
import { SavedListingsList } from "./saved-listings-list";

export const metadata: Metadata = { title: "Favourites" };

export default async function SavedListingsPage() {
  const listings = await getSavedListings();

  return (
    <>
      <h1 className="text-2xl">Favourites</h1>
      {listings.length === 0 ? (
        <div className="mt-6">
          <EmptyState
            icon={Heart}
            title="No favourites yet"
            body="Tap Save on any verified listing to keep it here for later."
            action={
              <Link
                href="/search"
                className="inline-flex h-10 items-center rounded-md bg-primary px-4 text-sm font-semibold text-primary-foreground shadow-xs transition-colors duration-150 hover:bg-teal-700"
              >
                Find housing near campus
              </Link>
            }
          />
        </div>
      ) : (
        <SavedListingsList initial={listings} />
      )}
    </>
  );
}
