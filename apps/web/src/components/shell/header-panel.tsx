"use client";

import { useLayoutEffect, useRef, useState, useSyncExternalStore } from "react";
import { Dialog, DialogBody, DialogHeader } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

const QUERY = "(max-width: 639px), (max-height: 500px)";
function subscribe(notify: () => void) {
  const media = window.matchMedia(QUERY);
  media.addEventListener("change", notify);
  return () => media.removeEventListener("change", notify);
}
const snapshot = () => window.matchMedia(QUERY).matches;

/** Use a modal when the anchored panel cannot fit, including at enlarged text
 * sizes. The contents wrapper adds no layout box to the caller's header. */
export function HeaderPanel({ label, onClose, className, widthRem = 20, children }: {
  label: string; onClose: () => void; className?: string; widthRem?: number; children: React.ReactNode;
}) {
  const host = useRef<HTMLDivElement>(null);
  const compactScreen = useSyncExternalStore(subscribe, snapshot, () => false);
  const [fitsAnchor, setFitsAnchor] = useState(true);
  useLayoutEffect(() => {
    const anchor = host.current?.parentElement;
    if (!anchor) return;
    const measure = () => {
      const rem = Number.parseFloat(getComputedStyle(document.documentElement).fontSize) || 16;
      const width = Math.min(widthRem * rem, window.innerWidth - 2 * rem);
      setFitsAnchor(anchor.getBoundingClientRect().right >= width + 16);
    };
    measure();
    const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(measure);
    observer?.observe(anchor);
    observer?.observe(document.documentElement);
    window.addEventListener("resize", measure);
    return () => { observer?.disconnect(); window.removeEventListener("resize", measure); };
  }, [widthRem]);
  return <div ref={host} className="contents">
    {compactScreen || !fitsAnchor ? <Dialog open onOpenChange={(open) => { if (!open) onClose(); }} aria-label={label} size="sm">
      <DialogHeader title={label} onClose={onClose} />
      <DialogBody className="p-0">{children}</DialogBody>
    </Dialog> : <div role="dialog" aria-label={label} style={{ width: `${widthRem}rem` }} className={cn("absolute right-0 top-full z-(--z-dropdown) mt-1.5 max-h-[calc(100dvh-6rem)] max-w-[calc(100vw-2rem)] overflow-y-auto overscroll-contain break-words rounded-xl border border-border bg-card shadow-xl", className)}>{children}</div>}
  </div>;
}
