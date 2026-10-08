"use client";

import { useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, X } from "lucide-react";

import { listingPhotoUrl } from "@/lib/cloudinary";
import { cn } from "@/lib/utils";

// Both listing_photos (inspection gallery) and unit_photos (per-room) carry
// enough here; the viewer only ever needs a storageKey to resolve a URL.
export type LightboxPhoto = { storageKey: string };
export type LightboxState = { photos: LightboxPhoto[]; index: number; caption: string };

/** Full-size photo viewer, shared between the inspection gallery and a
 * category's room-specific photos — `state` carries which set is open and
 * the caption explaining what the student is looking at. */
export function PhotoLightbox({
  state,
  propertyName,
  onClose,
  onNavigate,
}: {
  state: LightboxState | null;
  propertyName: string;
  onClose: () => void;
  onNavigate: (delta: 1 | -1) => void;
}) {
  const open = state !== null;
  const dialogRef = useRef<HTMLDialogElement>(null);

  // A native modal dialog sits in the browser's top layer, so the viewer
  // covers the whole screen even when opened from inside another dialog
  // (e.g. the landlord's property detail window), which would otherwise
  // clip a fixed-position overlay.
  useEffect(() => {
    const dialog = dialogRef.current;
    if (open && dialog && !dialog.open) dialog.showModal();
  }, [open]);

  useEffect(() => {
    if (!open) return;
    // Escape is handled by the dialog's own cancel event, so it closes only
    // this viewer and never a dialog underneath it.
    function onKey(e: KeyboardEvent) {
      if (e.key === "ArrowRight") onNavigate(1);
      if (e.key === "ArrowLeft") onNavigate(-1);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose, onNavigate]);

  if (!state) return null;
  const photo = state.photos[state.index];
  const url = listingPhotoUrl(photo.storageKey, 1600);

  return (
    <dialog
      ref={dialogRef}
      aria-label="Photo viewer"
      className="fixed inset-0 m-0 hidden h-dvh max-h-none w-screen max-w-none flex-col items-center justify-center bg-black/90 p-4 open:flex backdrop:bg-black/60"
      onClick={onClose}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
    >
      <button
        type="button"
        aria-label="Close photo viewer"
        onClick={onClose}
        className="absolute top-4 right-4 rounded-full p-2 text-white/80 transition-colors hover:bg-white/10 hover:text-white"
      >
        <X aria-hidden className="size-6" />
      </button>

      {state.photos.length > 1 && (
        <>
          <button
            type="button"
            aria-label="Previous photo"
            onClick={(e) => {
              e.stopPropagation();
              onNavigate(-1);
            }}
            className="absolute left-2 top-1/2 -translate-y-1/2 rounded-full p-2 text-white/80 transition-colors hover:bg-white/10 hover:text-white sm:left-4"
          >
            <ChevronLeft aria-hidden className="size-7" />
          </button>
          <button
            type="button"
            aria-label="Next photo"
            onClick={(e) => {
              e.stopPropagation();
              onNavigate(1);
            }}
            className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full p-2 text-white/80 transition-colors hover:bg-white/10 hover:text-white sm:right-4"
          >
            <ChevronRight aria-hidden className="size-7" />
          </button>
        </>
      )}

      {url && (
        <LightboxImage
          // Remounts per photo — the cleanest way to reset the loading
          // spinner without a setState-in-effect.
          key={`${photo.storageKey}-${state.index}`}
          url={url}
          alt={`${propertyName}, photo ${state.index + 1}`}
        />
      )}
      <p className="mt-3 text-center text-sm text-white/70">
        {state.caption}
        {state.photos.length > 1 && ` (${state.index + 1} / ${state.photos.length})`}
      </p>
    </dialog>
  );
}

function LightboxImage({ url, alt }: { url: string; alt: string }) {
  const [loaded, setLoaded] = useState(false);
  return (
    <>
      {!loaded && (
        <div
          aria-hidden
          className="size-16 animate-spin rounded-full border-4 border-white/20 border-t-white/80"
        />
      )}
      {/* eslint-disable-next-line @next/next/no-img-element -- full-viewport lightbox of an arbitrary-origin storage URL, next/image's fixed-layout modes don't fit this */}
      <img
        src={url}
        alt={alt}
        className={cn("max-h-[80vh] max-w-full rounded-md object-contain", !loaded && "hidden")}
        onLoad={() => setLoaded(true)}
        onClick={(e) => e.stopPropagation()}
      />
    </>
  );
}
