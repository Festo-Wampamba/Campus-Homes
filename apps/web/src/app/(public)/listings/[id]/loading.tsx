import { Skeleton } from "@/components/ui/skeleton";

// The listing page is a no-store server render (several API reads), so a
// card tap kept the old page on screen for seconds with no feedback. This
// skeleton mirrors the page's header + gallery/money-card grid.
export default function ListingLoading() {
  return (
    <div
      className="mx-auto w-full max-w-7xl px-4 py-7 sm:px-6 lg:px-8 lg:py-10"
      aria-busy="true"
      aria-label="Loading listing"
    >
      <Skeleton className="h-9 w-20" />
      <div className="mt-6 space-y-3 sm:mt-7">
        <Skeleton className="h-9 w-72 max-w-full" />
        <Skeleton className="h-4 w-56 max-w-full" />
      </div>
      <div className="mt-7 grid gap-8 lg:grid-cols-[minmax(0,1fr)_23rem] lg:items-start xl:gap-10">
        <div className="space-y-6">
          <Skeleton className="aspect-[4/3] w-full sm:aspect-[16/9]" />
          <Skeleton className="h-4 w-full max-w-xl" />
          <Skeleton className="h-4 w-4/5 max-w-lg" />
        </div>
        <Skeleton className="h-72 w-full" />
      </div>
    </div>
  );
}
