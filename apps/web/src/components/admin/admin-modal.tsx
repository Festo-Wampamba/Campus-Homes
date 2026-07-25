"use client";

import { X } from "lucide-react";
import { useEffect } from "react";

import { cn } from "@/lib/utils";

export function AdminModal({
  open,
  onClose,
  title,
  description,
  children,
  wide = false,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  children: React.ReactNode;
  wide?: boolean;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => { if (event.key === "Escape") onClose(); };
    document.addEventListener("keydown", onKey);
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.removeEventListener("keydown", onKey); document.body.style.overflow = previous; };
  }, [open, onClose]);

  if (!open) return null;
  return <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-950/65 px-3 py-8 backdrop-blur-sm sm:px-6" onMouseDown={onClose}>
    <section role="dialog" aria-modal="true" aria-label={title} onMouseDown={(event) => event.stopPropagation()} className={cn("my-auto w-full overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl dark:border-border dark:bg-card", wide ? "max-w-5xl" : "max-w-2xl")}>
      <header className="flex items-start gap-4 border-b border-slate-200 px-5 py-4 dark:border-border">
        <div className="min-w-0 flex-1"><h2 className="text-lg font-bold text-slate-950 dark:text-foreground">{title}</h2>{description && <p className="mt-1 text-xs leading-relaxed text-slate-500 dark:text-muted-foreground">{description}</p>}</div>
        <button type="button" aria-label="Close" onClick={onClose} className="grid size-10 shrink-0 place-items-center rounded-lg text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-600 dark:hover:bg-muted dark:hover:text-foreground"><X aria-hidden className="size-4" /></button>
      </header>
      <div className="max-h-[78vh] overflow-y-auto">{children}</div>
    </section>
  </div>;
}

export const adminFieldClass = "h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm outline-none placeholder:text-slate-400 focus:border-teal-600 focus:ring-2 focus:ring-teal-600/20 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-500 dark:border-border dark:bg-background dark:placeholder:text-slate-500 dark:disabled:bg-muted";
export const adminTextareaClass = "min-h-24 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none placeholder:text-slate-400 focus:border-teal-600 focus:ring-2 focus:ring-teal-600/20 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-500 dark:border-border dark:bg-background dark:placeholder:text-slate-500 dark:disabled:bg-muted";

export function AdminField({ label, hint, required, children, htmlFor }: { label: string; hint?: string; required?: boolean; children: React.ReactNode; htmlFor?: string }) {
  const labelText = <span className="mb-1.5 block text-xs font-bold text-slate-700 dark:text-foreground">{label}{required && <span aria-hidden className="ml-0.5 text-red-600">*</span>}{required && <span className="sr-only"> (required)</span>}</span>;
  const hintText = hint && <span className="mt-1 block text-[10px] text-slate-500">{hint}</span>;
  return htmlFor
    ? <div className="block"><label htmlFor={htmlFor}>{labelText}</label>{children}{hintText}</div>
    : <label className="block">{labelText}{children}{hintText}</label>;
}
