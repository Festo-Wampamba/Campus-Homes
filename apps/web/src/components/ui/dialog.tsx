"use client";

import { createContext, useContext, useEffect, useId, useRef } from "react";
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
const DialogTitleId = createContext<string | undefined>(undefined);

const DIALOG_WIDTH = {
  // A single stacked column of fields (e.g. a 4-field signup form) reads as
  // oddly wide and flat at "md" width, which was sized for two-up layouts.
  sm: "[--ch-dialog-width:26rem]",
  // Landscape, not portrait — width comfortably exceeds height for a typical
  // form's worth of fields laid out two-up (see PropertyForm).
  md: "[--ch-dialog-width:38rem]",
  lg: "[--ch-dialog-width:56rem]",
  // Dense multi-column forms (the room-type spec: 2- and 3-up rows plus
  // amenities, description and photos) need more room before columns get
  // cramped — the body still scrolls vertically within max-h.
  xl: "[--ch-dialog-width:72rem]",
};

function Dialog({
  open,
  onOpenChange,
  size = "md",
  dismissible = true,
  resizable = false,
  className,
  "aria-label": ariaLabel,
  children,
}: {
  className?: string;
  "aria-label"?: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  size?: "sm" | "md" | "lg" | "xl";
  // Corner-drag resize on sm+ screens, bounded to the viewport.
  resizable?: boolean;
  // false = a backdrop click or Escape can't close this — only an explicit
  // Cancel/X click can. For a long form (the tenant-agreement builder, the
  // property form) a stray click just outside the card used to silently
  // discard everything typed, with no confirmation. Viewer-only dialogs
  // (nothing to lose) keep the default.
  dismissible?: boolean;
  children: React.ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();

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
      aria-label={ariaLabel}
      aria-labelledby={ariaLabel ? undefined : titleId}
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
        "ch-dialog hidden open:flex m-auto min-w-0 flex-col overflow-hidden rounded-lg border border-border bg-card p-0 text-foreground shadow-lg",
        DIALOG_WIDTH[size],
        // Native corner resize (CSS `resize` works with overflow-hidden),
        // bounded so the dialog never outgrows the viewport. Phones keep the
        // fixed full-width layout.
        resizable && "ch-dialog--resizable sm:resize",
        "z-(--z-modal) backdrop:bg-black/50",
        "open:animate-in open:fade-in open:zoom-in-95 open:duration-150",
        className,
      )}
    >
      {/* On larger screens, a flex column filling the dialog's max-height — DialogBody is the
          only flexible/scrollable region (flex-auto min-h-0), so header and
          footer stay visible. Compact screens scroll the whole content so
          enlarged headings and footer buttons leave every field reachable.
          flex-auto, not flex-1: the dialog's height is auto, and Safari
          (iOS) sizes a `flex-basis: 0%` child of an auto-height column to
          zero — the open dialog collapsed to a thin line over the backdrop. */}
      {open && (
        <div className="ch-dialog-content flex min-h-0 min-w-0 flex-auto flex-col" onClick={(e) => e.stopPropagation()}>
          <DialogTitleId.Provider value={titleId}>{children}</DialogTitleId.Provider>
        </div>
      )}
    </dialog>
  );
}

function DialogHeader({
  className,
  title,
  description,
  onClose,
}: {
  className?: string;
  title: string;
  description?: string;
  onClose: () => void;
}) {
  const titleId = useContext(DialogTitleId);
  return (
    <div className={cn("ch-dialog-header shrink-0 border-b border-border p-3 sm:p-5", className)}>
      <Button type="button" variant="ghost" size="icon" aria-label="Close" className="float-right mb-1 ml-3" onClick={onClose}>
        <X aria-hidden className="size-4" />
      </Button>
      <div className="min-w-0 break-words">
        <h2 id={titleId} className="font-display text-lg font-bold text-foreground">{title}</h2>
        {description && <p className="mt-1 text-sm text-muted-foreground">{description}</p>}
      </div>
    </div>
  );
}

function DialogBody({ className, ...props }: React.ComponentProps<"div">) {
  return <div className={cn("ch-dialog-body min-h-0 min-w-0 flex-auto overflow-y-auto p-3 sm:p-5", className)} {...props} />;
}

function DialogFooter({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      className={cn(
        "ch-dialog-footer flex shrink-0 flex-wrap items-center justify-end gap-2 border-t border-border p-3 sm:p-5",
        className,
      )}
      {...props}
    />
  );
}

export { Dialog, DialogHeader, DialogBody, DialogFooter };
