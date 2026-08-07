"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";

export function PaginationControls({
  page,
  totalPages,
  total,
  pageSize,
  onPageChange,
}: {
  page: number;
  totalPages: number;
  total: number;
  pageSize: number;
  onPageChange: (page: number) => void;
}) {
  if (total === 0) return null;
  const start = (page - 1) * pageSize + 1;
  const end = Math.min(page * pageSize, total);

  return (
    <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border px-4 py-2.5 text-xs text-muted-foreground">
      <span>
        Showing {start}–{end} of {total}
      </span>
      {totalPages > 1 && (
        <div className="flex items-center gap-1">
          <button
            type="button"
            aria-label="Previous page"
            disabled={page <= 1}
            onClick={() => onPageChange(page - 1)}
            className="grid size-7 place-items-center rounded-md border border-border transition-colors hover:bg-muted disabled:opacity-40"
          >
            <ChevronLeft aria-hidden className="size-3.5" />
          </button>
          <span className="min-w-14 text-center font-semibold text-foreground">
            {page} / {totalPages}
          </span>
          <button
            type="button"
            aria-label="Next page"
            disabled={page >= totalPages}
            onClick={() => onPageChange(page + 1)}
            className="grid size-7 place-items-center rounded-md border border-border transition-colors hover:bg-muted disabled:opacity-40"
          >
            <ChevronRight aria-hidden className="size-3.5" />
          </button>
        </div>
      )}
    </div>
  );
}
