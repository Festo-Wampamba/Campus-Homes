"use client";

import { Download, Search } from "lucide-react";
import { useMemo, useState } from "react";

import { PaginationControls } from "@/components/pagination-controls";
import { ViewToggle, type ViewMode } from "@/components/view-toggle";
import { usePagination } from "@/lib/use-pagination";
import { StatusBadge } from "./admin-ui";

export interface AdminColumn {
  key: string;
  label: string;
  format?: "text" | "date" | "money" | "status" | "boolean" | "id" | "roles";
}

function display(value: unknown, format: AdminColumn["format"]) {
  if (format === "status") return <StatusBadge value={value} />;
  if (format === "date") return value ? new Date(String(value)).toLocaleString() : "—";
  if (format === "money") return new Intl.NumberFormat("en-UG", { style: "currency", currency: "UGX", maximumFractionDigits: 0 }).format(Number(value ?? 0));
  if (format === "boolean") return <StatusBadge value={value ? "configured" : "unconfigured"} />;
  if (format === "id") return value ? <code className="text-[11px]">{String(value).slice(0, 8)}</code> : "—";
  if (format === "roles") {
    const roles = Array.isArray(value) ? value as { name?: string; key?: string; scopeId?: string | null }[] : [];
    return roles.length ? <div className="flex flex-wrap gap-1">{roles.map((role, index) => <span key={`${role.key}-${index}`} className="rounded bg-slate-100 px-1.5 py-1 text-[10px] font-semibold text-slate-700 dark:bg-muted dark:text-muted-foreground">{role.name ?? role.key}{role.scopeId ? ` · ${role.scopeId}` : ""}</span>)}</div> : "—";
  }
  return value === null || value === undefined || value === "" ? "—" : String(value).replaceAll("_", " ");
}

function csvCell(value: unknown) {
  const plain = typeof value === "object" ? JSON.stringify(value) : String(value ?? "");
  return `"${plain.replaceAll('"', '""')}"`;
}

export function AdminTable({ rows, columns, searchPlaceholder = "Search records…", filename = "campushomes-export.csv" }: { rows: Record<string, unknown>[]; columns: AdminColumn[]; searchPlaceholder?: string; filename?: string }) {
  const [query, setQuery] = useState("");
  const [view, setView] = useState<ViewMode>("grid");
  const filtered = useMemo(() => rows.filter((row) => JSON.stringify(row).toLowerCase().includes(query.trim().toLowerCase())), [rows, query]);
  const { page, setPage, totalPages, pageItems, total, pageSize } = usePagination(filtered, 10);
  const [primary, ...secondary] = columns;

  function download() {
    const csv = [columns.map((column) => csvCell(column.label)).join(","), ...filtered.map((row) => columns.map((column) => csvCell(row[column.key])).join(","))].join("\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = filename;
    anchor.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div>
      <div className="flex flex-col gap-2 border-b border-slate-100 p-3 sm:flex-row sm:items-center dark:border-border">
        <label className="relative flex-1">
          <span className="sr-only">Search records</span>
          <Search aria-hidden className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
          <input value={query} onChange={(event) => { setQuery(event.target.value); setPage(1); }} placeholder={searchPlaceholder} className="h-10 w-full rounded-lg border border-slate-200 bg-white pl-9 pr-3 text-sm outline-none transition-colors focus:border-teal-600 focus:ring-2 focus:ring-teal-600/15 dark:border-border dark:bg-background" />
        </label>
        <div className="flex gap-2">
          <ViewToggle view={view} onChange={setView} />
          <button type="button" onClick={download} disabled={!filtered.length} className="inline-flex h-10 shrink-0 items-center justify-center gap-2 rounded-lg border border-slate-200 px-3 text-sm font-bold text-slate-700 transition-colors hover:bg-slate-50 disabled:opacity-40 dark:border-border dark:text-foreground dark:hover:bg-muted">
            <Download aria-hidden className="size-4" />
            Export CSV
          </button>
        </div>
      </div>

      {view === "list" && (
        <div className="overflow-x-auto">
          <table className="w-full min-w-max text-left text-xs">
            <thead className="bg-slate-50/80 text-slate-500 dark:bg-muted/50 dark:text-muted-foreground">
              <tr>{columns.map((column) => <th key={column.key} className="px-4 py-3 font-bold uppercase tracking-[0.06em]">{column.label}</th>)}</tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-border">
              {pageItems.map((row, index) => (
                <tr key={String(row.id ?? index)} className="transition-colors hover:bg-slate-50/80 dark:hover:bg-muted/40">
                  {columns.map((column) => <td key={column.key} className="max-w-72 px-4 py-3.5 text-slate-600 dark:text-muted-foreground first:font-semibold first:text-slate-900 dark:first:text-foreground">{display(row[column.key], column.format)}</td>)}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {view === "rows" && (
        <div className="divide-y divide-slate-100 dark:divide-border">
          {pageItems.map((row, index) => (
            <div key={String(row.id ?? index)} className="flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-3 transition-colors hover:bg-slate-50/80 dark:hover:bg-muted/40">
              {primary && <span className="text-sm font-semibold text-slate-900 dark:text-foreground">{display(row[primary.key], primary.format)}</span>}
              {secondary.map((column) => (
                <span key={column.key} className="text-xs text-slate-500 dark:text-muted-foreground">
                  <span className="mr-1 font-semibold uppercase tracking-[0.04em] text-slate-400">{column.label}:</span>
                  {display(row[column.key], column.format)}
                </span>
              ))}
            </div>
          ))}
        </div>
      )}

      {view === "grid" && (
        <div className="grid gap-3 p-3 sm:grid-cols-2 lg:grid-cols-3">
          {pageItems.map((row, index) => (
            <div key={String(row.id ?? index)} className="rounded-lg border border-slate-200 p-3.5 transition-colors hover:border-slate-300 dark:border-border dark:hover:border-muted-foreground/40">
              {primary && <p className="mb-2 text-sm font-semibold text-slate-900 dark:text-foreground">{display(row[primary.key], primary.format)}</p>}
              <dl className="space-y-1.5">
                {secondary.map((column) => (
                  <div key={column.key} className="flex items-baseline justify-between gap-2 text-xs">
                    <dt className="shrink-0 font-semibold uppercase tracking-[0.04em] text-slate-400">{column.label}</dt>
                    <dd className="min-w-0 truncate text-right text-slate-600 dark:text-muted-foreground">{display(row[column.key], column.format)}</dd>
                  </div>
                ))}
              </dl>
            </div>
          ))}
        </div>
      )}

      {!filtered.length && <p className="px-4 py-12 text-center text-sm text-slate-500">{rows.length ? "No records match your search." : "No records yet."}</p>}
      <PaginationControls page={page} totalPages={totalPages} total={total} pageSize={pageSize} onPageChange={setPage} />
    </div>
  );
}
