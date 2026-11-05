"use client";

import { useSyncExternalStore } from "react";
import { Dialog, DialogBody, DialogHeader } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

const QUERY = "(max-width: 639px), (max-height: 500px)";
function subscribe(notify: () => void) {
  const media = window.matchMedia(QUERY);
  media.addEventListener("change", notify);
  return () => media.removeEventListener("change", notify);
}
const snapshot = () => window.matchMedia(QUERY).matches;

/** A compact screen needs viewport bounds and a focus trap, rather than a
 * dropdown whose right edge is anchored to a button halfway across the bar. */
export function HeaderPanel({ label, onClose, className, children }: {
  label: string; onClose: () => void; className?: string; children: React.ReactNode;
}) {
  const compact = useSyncExternalStore(subscribe, snapshot, () => false);
  if (compact) return <Dialog open onOpenChange={(open) => { if (!open) onClose(); }} aria-label={label} size="sm">
    <DialogHeader title={label} onClose={onClose} />
    <DialogBody className="p-0">{children}</DialogBody>
  </Dialog>;
  return <div role="dialog" aria-label={label} className={cn("absolute right-0 top-full z-(--z-dropdown) mt-1.5 max-h-[calc(100dvh-6rem)] w-80 max-w-[calc(100vw-2rem)] overflow-y-auto overscroll-contain break-words rounded-xl border border-border bg-card shadow-xl", className)}>{children}</div>;
}
