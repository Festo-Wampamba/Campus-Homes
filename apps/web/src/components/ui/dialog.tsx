"use client";

import { useEffect, useRef } from "react";
import { X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * Native <dialog> gives us focus trapping, Escape-to-close, and a backdrop
 * for free — no need to hand-roll those (unlike AccountMenu's manual
 * click-outside listener, which exists only because a dropdown isn't a
 * <dialog>). `open`/`onOpenChange` mirror the usual controlled-dialog shape
 * so callers can drive it from their own create/edit state.
 */
const DIALOG_WIDTH = {
  // A single stacked column of fields (e.g. a 4-field signup form) reads as
  // oddly wide and flat at "md" width, which was sized for two-up layouts.
  sm: "w-[min(26rem,calc(100vw-2rem))]",
  // Landscape, not portrait — width comfortably exceeds height for a typical
  // form's worth of fields laid out two-up (see PropertyForm).
  md: "w-[min(38rem,calc(100vw-2rem))]",
  lg: "w-[min(56rem,calc(100vw-2rem))]",
};

function Dialog({
  open,
  onOpenChange,
  size = "md",
  dismissible = true,
  children,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  size?: "sm" | "md" | "lg";
  // false = a backdrop click or Escape can't close this — only an explicit
  // Cancel/X click can. For a long form (the tenant-agreement builder, the
  // property form) a stray click just outside the card used to silently
  // discard everything typed, with no confirmation. Viewer-only dialogs
  // (nothing to lose) keep the default.
  dismissible?: boolean;
  children: React.ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    // The native <dialog> fires `cancel` (Escape) just before `close` —
    // preventDefault on `cancel` stops both from happening at all, rather
    // than closing and immediately reopening.
    function handleCancel(e: Event) {
      if (!dismissible) e.preventDefault();
    }
    dialog.addEventListener("cancel", handleCancel);
    return () => dialog.removeEventListener("cancel", handleCancel);
  }, [dismissible]);

  return (
    <dialog
      ref={ref}
      onClose={() => onOpenChange(false)}
      onClick={(e) => {
        if (!dismissible) return;
        // A click that lands on the <dialog> element itself (not its content
        // wrapper below) is a backdrop click, since the wrapper covers the
        // rest of the box.
        if (e.target === ref.current) onOpenChange(false);
      }}
      className={cn(
        // Tailwind's preflight resets `margin: 0` globally, which kills the
        // native <dialog>'s default `margin: auto` centering — `m-auto`
        // restores it (the UA stylesheet already makes a shown <dialog>
        // `position: fixed; inset: 0` with auto width/height).
        //
        // `hidden open:flex` (not a bare `flex`) matters: an author-origin
        // `display` declaration always wins over the UA stylesheet's
        // `dialog:not([open]) { display: none }`, regardless of selector
        // specificity — a bare `flex` class was therefore keeping every
        // closed dialog laid out (display: flex, just empty since children
        // only render when `open`), collapsing to a ~1px-tall box that still
        // painted its own border as a stray horizontal line wherever it sat
        // in the page — one per Dialog instance, so it multiplied on pages
        // with several (e.g. one ReserveButton per room row).
        "hidden open:flex m-auto max-h-[85vh] flex-col overflow-hidden rounded-lg border border-border bg-card p-0 text-foreground shadow-lg",
        DIALOG_WIDTH[size],
        "z-(--z-modal) backdrop:bg-black/50",
        "open:animate-in open:fade-in open:zoom-in-95 open:duration-150",
      )}
    >
      {/* flex column filling the dialog's max-height — DialogBody is the
          only flexible/scrollable region (flex-1 min-h-0), so header and
          footer (with the submit button) can never get clipped off the
          bottom the way plain stacked blocks + overflow-hidden would. */}
      {open && (
        <div className="flex min-h-0 flex-1 flex-col" onClick={(e) => e.stopPropagation()}>
          {children}
        </div>
      )}
    </dialog>
  );
}

function DialogHeader({
  title,
  description,
  onClose,
}: {
  title: string;
  description?: string;
  onClose: () => void;
}) {
  return (
    <div className="flex shrink-0 items-start justify-between gap-4 border-b border-border p-5">
      <div>
        <h2 className="font-display text-lg font-bold text-foreground">{title}</h2>
        {description && <p className="mt-1 text-sm text-muted-foreground">{description}</p>}
      </div>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        aria-label="Close"
        className="-mt-1 -mr-1 shrink-0"
        onClick={onClose}
      >
        <X aria-hidden className="size-4" />
      </Button>
    </div>
  );
}

function DialogBody({ className, ...props }: React.ComponentProps<"div">) {
  return <div className={cn("min-h-0 flex-1 overflow-y-auto p-5", className)} {...props} />;
}

function DialogFooter({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      className={cn(
        "flex shrink-0 items-center justify-end gap-2 border-t border-border p-5",
        className,
      )}
      {...props}
    />
  );
}

export { Dialog, DialogHeader, DialogBody, DialogFooter };
