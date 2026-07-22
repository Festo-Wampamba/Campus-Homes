import { ArrowDownRight, ArrowUpRight, Database, type LucideIcon } from "lucide-react";

import { cn } from "@/lib/utils";

export function PageHeader({ eyebrow, title, description, actions }: { eyebrow?: string; title: string; description: string; actions?: React.ReactNode }) {
  return <div className="mb-6 flex flex-col justify-between gap-4 sm:flex-row sm:items-end"><div>{eyebrow && <p className="mb-1 text-xs font-bold uppercase tracking-[0.12em] text-teal-700 dark:text-teal-600">{eyebrow}</p>}<h1 className="text-2xl font-bold tracking-tight text-slate-950 dark:text-foreground sm:text-3xl">{title}</h1><p className="mt-1.5 max-w-2xl text-sm leading-relaxed text-slate-500 dark:text-muted-foreground">{description}</p></div>{actions && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}</div>;
}

export function Freshness({ asOf, source = "CampusHomes operational PostgreSQL" }: { asOf: string; source?: string }) {
  return <p className="flex items-center gap-1.5 text-[11px] text-slate-500 dark:text-muted-foreground"><Database aria-hidden className="size-3" />Live source: {source} · refreshed {new Date(asOf).toLocaleString()}</p>;
}

export function StatCard({ label, value, detail, icon: Icon, trend, tone = "teal" }: { label: string; value: string; detail: string; icon: LucideIcon; trend?: number | null; tone?: "teal" | "blue" | "amber" | "violet" }) {
  const tones = { teal: "bg-teal-50 text-teal-700 dark:bg-teal-100", blue: "bg-blue-50 text-blue-700 dark:bg-blue-950", amber: "bg-amber-50 text-amber-700 dark:bg-amber-950", violet: "bg-violet-50 text-violet-700 dark:bg-violet-950" };
  return <article className="rounded-xl border border-slate-200 bg-white p-4 shadow-[0_1px_2px_rgba(15,23,42,0.04)] dark:border-border dark:bg-card"><div className="flex items-start justify-between gap-3"><div><p className="text-xs font-semibold text-slate-500 dark:text-muted-foreground">{label}</p><p className="tabular mt-2 text-2xl font-bold tracking-tight text-slate-950 dark:text-foreground">{value}</p></div><span className={cn("grid size-9 place-items-center rounded-lg", tones[tone])}><Icon aria-hidden className="size-4.5" /></span></div><div className="mt-3 flex min-h-4 items-center gap-1.5 text-[11px] text-slate-500 dark:text-muted-foreground">{trend !== undefined && trend !== null && <span className={cn("inline-flex items-center font-bold", trend >= 0 ? "text-emerald-700" : "text-red-700")}>{trend >= 0 ? <ArrowUpRight aria-hidden className="size-3" /> : <ArrowDownRight aria-hidden className="size-3" />}{Math.abs(trend).toFixed(1)}%</span>}<span>{detail}</span></div></article>;
}

export function StatusBadge({ value }: { value: unknown }) {
  const text = String(value ?? "unknown").replaceAll("_", " ");
  const good = ["active", "verified", "passed", "succeeded", "fulfilled", "processed", "sent", "delivered", "configured", "issued"].includes(String(value));
  const bad = ["suspended", "failed", "rejected", "cancelled", "expired", "unconfigured"].includes(String(value));
  return <span className={cn("inline-flex whitespace-nowrap rounded-full px-2 py-1 text-[11px] font-bold capitalize", good ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-950" : bad ? "bg-red-50 text-red-700 dark:bg-red-950" : "bg-amber-50 text-amber-700 dark:bg-amber-950")}>{text}</span>;
}

export function EmptyState({ title = "No records yet", description = "This view will populate as operational data is created." }: { title?: string; description?: string }) {
  return <div className="rounded-xl border border-dashed border-slate-300 bg-white px-6 py-12 text-center dark:border-border dark:bg-card"><p className="font-bold text-slate-800 dark:text-foreground">{title}</p><p className="mt-1 text-sm text-slate-500 dark:text-muted-foreground">{description}</p></div>;
}

export function SectionCard({ title, description, action, children, className }: { title: string; description?: string; action?: React.ReactNode; children: React.ReactNode; className?: string }) {
  return <section className={cn("overflow-hidden rounded-xl border border-slate-200 bg-white shadow-[0_1px_2px_rgba(15,23,42,0.03)] dark:border-border dark:bg-card", className)}><div className="flex items-start justify-between gap-4 border-b border-slate-100 px-4 py-4 sm:px-5 dark:border-border"><div><h2 className="text-sm font-bold text-slate-900 dark:text-foreground">{title}</h2>{description && <p className="mt-1 text-xs text-slate-500 dark:text-muted-foreground">{description}</p>}</div>{action}</div>{children}</section>;
}
