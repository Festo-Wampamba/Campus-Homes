import { useState } from "react";

export interface Pagination<T> {
  page: number;
  setPage: (page: number) => void;
  totalPages: number;
  pageItems: T[];
  total: number;
  pageSize: number;
}

/** Slices `items` into a 10-per-page (default) window. `page` is clamped to
 * the valid range on every render, so a shrinking list (e.g. a narrower
 * search) never gets stuck showing an empty page — no effect/setState
 * needed to "reset" it. */
export function usePagination<T>(items: T[], pageSize = 10): Pagination<T> {
  const [page, setPage] = useState(1);
  const totalPages = Math.max(1, Math.ceil(items.length / pageSize));
  const safePage = Math.min(Math.max(page, 1), totalPages);
  const start = (safePage - 1) * pageSize;
  const pageItems = items.slice(start, start + pageSize);
  return { page: safePage, setPage, totalPages, pageItems, total: items.length, pageSize };
}
