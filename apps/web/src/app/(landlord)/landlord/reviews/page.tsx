import type { Metadata } from "next";
import { Star } from "lucide-react";
import { landlordRatingsSummarySchema } from "@campushomes/shared";

import { Stars } from "@/components/chat/rate-landlord";
import { EmptyState } from "@/components/empty-state";
import { apiServer } from "@/lib/server-api";

export const metadata: Metadata = { title: "Reviews" };

export default async function LandlordReviewsPage() {
  const raw = await apiServer<unknown>("/landlord-ratings/about-me");
  const parsed = raw ? landlordRatingsSummarySchema.safeParse(raw) : null;
  const summary = parsed?.success ? parsed.data : null;

  return (
    <>
      <h1 className="text-2xl">Reviews</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Ratings from students who reserved at your hostel and messaged you. Students’ names are never shown.
      </p>

      <div className="mt-6">
        {!summary ? (
          <p role="alert" className="text-sm text-destructive">Couldn’t load your ratings. Refresh the page to try again.</p>
        ) : summary.count === 0 ? (
          <EmptyState
            icon={Star}
            title="No ratings yet"
            body="A student can rate you after reserving at your hostel and messaging you. Ratings show here and on your hostel page."
          />
        ) : (
          <>
            <p className="flex flex-wrap items-center gap-2 text-lg font-semibold">
              <Stars value={summary.average ?? 0} />
              {summary.average} out of 5
              <span className="text-sm font-normal text-muted-foreground">
                from {summary.count} student {summary.count === 1 ? "rating" : "ratings"}
              </span>
            </p>
            <ul className="mt-4 divide-y divide-border rounded-2xl border border-border bg-card">
              {summary.items.map((item) => (
                <li key={item.createdAt} className="p-4">
                  <div className="flex items-center justify-between gap-3">
                    <Stars value={item.rating} />
                    <time dateTime={item.createdAt} className="text-xs text-muted-foreground">
                      {new Date(item.createdAt).toLocaleDateString("en-UG", { day: "numeric", month: "short", year: "numeric" })}
                    </time>
                  </div>
                  <p className="mt-2 text-sm [overflow-wrap:anywhere]">{item.comment ?? <span className="text-muted-foreground">No comment</span>}</p>
                </li>
              ))}
            </ul>
          </>
        )}
      </div>
    </>
  );
}
