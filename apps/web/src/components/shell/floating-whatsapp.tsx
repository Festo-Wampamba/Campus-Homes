"use client";

import { usePathname } from "next/navigation";
import { useEffect, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent } from "react";
import { CAMPUSHOMES_CONTACT } from "@/lib/contact-details";

const POSITION_STORAGE_KEY = "campushomes:whatsapp-float-position";
const FLOATING_SIZE = 56;
const EDGE_MARGIN = 20;
const BOTTOM_MARGIN = 24;
const COLLISION_GAP = 8;
const DRAG_THRESHOLD = 6;
const KEYBOARD_STEP = 24;

export type FloatingPosition = { left: number; top: number };

type FloatingViewport = { width: number; height: number };
export type FloatingObstacle = Pick<DOMRect, "left" | "top" | "right" | "bottom">;

function finite(value: number, fallback: number) {
  return Number.isFinite(value) ? value : fallback;
}

function clamp(value: number, minimum: number, maximum: number) {
  return Math.min(Math.max(value, minimum), maximum);
}

function distance(a: FloatingPosition, b: FloatingPosition) {
  return Math.hypot(a.left - b.left, a.top - b.top);
}

function overlaps(position: FloatingPosition, obstacle: FloatingObstacle, size: number) {
  return position.left < obstacle.right + COLLISION_GAP &&
    position.left + size > obstacle.left - COLLISION_GAP &&
    position.top < obstacle.bottom + COLLISION_GAP &&
    position.top + size > obstacle.top - COLLISION_GAP;
}

/** Keep a moved shortcut in the viewport and step it around fixed obstructions. */
export function clampFloatingPosition(
  desired: FloatingPosition,
  viewport: FloatingViewport,
  obstacles: FloatingObstacle[] = [],
  size = FLOATING_SIZE,
): FloatingPosition {
  const maxLeft = Math.max(EDGE_MARGIN, viewport.width - size - EDGE_MARGIN);
  const maxTop = Math.max(EDGE_MARGIN, viewport.height - size - BOTTOM_MARGIN);
  const withinViewport = (position: FloatingPosition): FloatingPosition => ({
    left: clamp(finite(position.left, maxLeft), EDGE_MARGIN, maxLeft),
    top: clamp(finite(position.top, maxTop), EDGE_MARGIN, maxTop),
  });

  let current = withinViewport(desired);
  const usableObstacles = obstacles.filter((obstacle) => (
    Number.isFinite(obstacle.left) && Number.isFinite(obstacle.top) &&
    Number.isFinite(obstacle.right) && Number.isFinite(obstacle.bottom) &&
    obstacle.right > obstacle.left && obstacle.bottom > obstacle.top
  ));

  for (let pass = 0; pass < usableObstacles.length + 2; pass += 1) {
    const conflicts = usableObstacles.filter((obstacle) => overlaps(current, obstacle, size));
    if (!conflicts.length) return current;

    const candidates = conflicts.flatMap((obstacle) => [
      { left: obstacle.left - size - COLLISION_GAP, top: current.top },
      { left: obstacle.right + COLLISION_GAP, top: current.top },
      { left: current.left, top: obstacle.top - size - COLLISION_GAP },
      { left: current.left, top: obstacle.bottom + COLLISION_GAP },
    ]).map(withinViewport);

    const safeCandidate = candidates
      .filter((candidate) => usableObstacles.every((obstacle) => !overlaps(candidate, obstacle, size)))
      .sort((a, b) => distance(a, desired) - distance(b, desired))[0];
    const next = safeCandidate ?? candidates.sort((a, b) => distance(a, desired) - distance(b, desired))[0];
    if (!next || (next.left === current.left && next.top === current.top)) return current;
    current = next;
  }

  return current;
}

function readStoredPosition(): FloatingPosition | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.sessionStorage.getItem(POSITION_STORAGE_KEY);
    if (!raw) return null;
    const value = JSON.parse(raw) as Partial<FloatingPosition>;
    if (typeof value.left === "number" && Number.isFinite(value.left) &&
      typeof value.top === "number" && Number.isFinite(value.top)) return { left: value.left, top: value.top };
  } catch {
    // Storage can be unavailable in private browsing or when disabled.
  }
  return null;
}

function writeStoredPosition(position: FloatingPosition) {
  try {
    window.sessionStorage.setItem(POSITION_STORAGE_KEY, JSON.stringify(position));
  } catch {
    // The shortcut remains usable when session storage is unavailable.
  }
}

function clearStoredPosition() {
  try {
    window.sessionStorage.removeItem(POSITION_STORAGE_KEY);
  } catch {
    // Ignore blocked storage.
  }
}

function rectFromElement(element: Element | null): FloatingObstacle | null {
  if (!element) return null;
  const rect = element.getBoundingClientRect();
  if (rect.width <= 0 || rect.height <= 0) return null;
  return { left: rect.left, top: rect.top, right: rect.right, bottom: rect.bottom };
}

function fixedObstacles(notice: Element | null, widget: Element | null): FloatingObstacle[] {
  const viewportWidth = window.innerWidth;
  const viewportHeight = window.innerHeight;
  const obstacles: FloatingObstacle[] = [];
  const noticeStyle = notice ? getComputedStyle(notice) : null;
  if (noticeStyle?.position === "fixed") {
    const rect = rectFromElement(notice);
    if (rect) obstacles.push(rect);
  }

  const candidates = document.querySelectorAll<HTMLElement>(
    '[class~="fixed"], [data-phone-reservation-bar], [data-reservation-bar]',
  );
  candidates.forEach((element) => {
    if (element === widget || element === notice || getComputedStyle(element).position !== "fixed") return;
    const rect = element.getBoundingClientRect();
    const isFullWidthBottomBar = rect.width >= viewportWidth - 2 &&
      rect.left <= 2 && rect.right >= viewportWidth - 2 &&
      rect.bottom >= viewportHeight - 2 && rect.top < viewportHeight && rect.height > 0;
    if (isFullWidthBottomBar) obstacles.push({ left: rect.left, top: rect.top, right: rect.right, bottom: rect.bottom });
  });
  return obstacles;
}

function samePosition(a: FloatingPosition, b: FloatingPosition) {
  return Math.abs(a.left - b.left) < 0.5 && Math.abs(a.top - b.top) < 0.5;
}

/** Customer contact shortcut; staff workspaces keep their existing controls. */
export function FloatingWhatsApp() {
  const pathname = usePathname() ?? "";
  const widgetRef = useRef<HTMLAnchorElement>(null);
  const positionRef = useRef<FloatingPosition | null>(null);
  const dragRef = useRef<{
    pointerId: number;
    startX: number;
    startY: number;
    origin: FloatingPosition;
    didDrag: boolean;
  } | null>(null);
  const suppressClickRef = useRef(false);
  const [position, setPosition] = useState<FloatingPosition | null>(null);
  const [noticeOffset, setNoticeOffset] = useState(0);
  const [isDragging, setIsDragging] = useState(false);

  function updatePosition(next: FloatingPosition | null, persist = false) {
    positionRef.current = next;
    setPosition(next);
    if (next && persist) writeStoredPosition(next);
  }

  function currentPosition(): FloatingPosition {
    const rect = widgetRef.current?.getBoundingClientRect();
    if (rect && rect.width > 0 && rect.height > 0) return { left: rect.left, top: rect.top };
    if (positionRef.current) return positionRef.current;
    return {
      left: Math.max(EDGE_MARGIN, window.innerWidth - FLOATING_SIZE - EDGE_MARGIN),
      top: Math.max(EDGE_MARGIN, window.innerHeight - FLOATING_SIZE - BOTTOM_MARGIN),
    };
  }

  function movePosition(next: FloatingPosition, persist = true) {
    const notice = document.querySelector('[aria-label="Cookie notice"]');
    const viewport = { width: window.innerWidth, height: window.innerHeight };
    const clamped = clampFloatingPosition(next, viewport, fixedObstacles(notice, widgetRef.current));
    updatePosition(clamped, persist);
  }

  useEffect(() => {
    const stored = readStoredPosition();
    if (!stored) return;
    positionRef.current = stored;
    const applyStoredPosition = () => {
      const current = positionRef.current;
      if (!current) return;
      const notice = document.querySelector('[aria-label="Cookie notice"]');
      const next = clampFloatingPosition(
        current,
        { width: window.innerWidth, height: window.innerHeight },
        fixedObstacles(notice, widgetRef.current),
      );
      positionRef.current = next;
      setPosition(next);
      writeStoredPosition(next);
    };
    if (typeof window.requestAnimationFrame === "function") {
      const frame = window.requestAnimationFrame(applyStoredPosition);
      return () => window.cancelAnimationFrame(frame);
    }
    const timer = window.setTimeout(applyStoredPosition, 0);
    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    let notice: Element | null = null;
    const measure = () => {
      const box = notice?.getBoundingClientRect();
      const fixed = notice && getComputedStyle(notice).position === "fixed";
      // Only lift the shortcut when the notice occupies its screen corner.
      const nextNoticeOffset = box && fixed && box.right > window.innerWidth - 80 ? window.innerHeight - box.top + 16 : 0;
      setNoticeOffset((current) => current === nextNoticeOffset ? current : nextNoticeOffset);

      const current = positionRef.current;
      if (!current || !widgetRef.current) return;
      const next = clampFloatingPosition(
        current,
        { width: window.innerWidth, height: window.innerHeight },
        fixedObstacles(notice, widgetRef.current),
      );
      if (!samePosition(current, next)) updatePosition(next, true);
    };
    const resize = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(measure);
    const observeNotice = () => {
      if (notice) resize?.unobserve(notice);
      notice = document.querySelector('[aria-label="Cookie notice"]');
      if (notice) resize?.observe(notice);
      measure();
    };
    const changes = new MutationObserver(observeNotice);
    changes.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ["class", "style", "aria-label"] });
    resize?.observe(document.body);
    observeNotice();
    window.addEventListener("resize", measure);
    window.addEventListener("orientationchange", measure);
    window.visualViewport?.addEventListener("resize", measure);
    return () => {
      changes.disconnect();
      resize?.disconnect();
      window.removeEventListener("resize", measure);
      window.removeEventListener("orientationchange", measure);
      window.visualViewport?.removeEventListener("resize", measure);
    };
  }, [pathname]);

  function pointerDown(event: ReactPointerEvent<HTMLAnchorElement>) {
    if (!event.isPrimary || (event.pointerType === "mouse" && event.button !== 0)) return;
    const origin = currentPosition();
    dragRef.current = { pointerId: event.pointerId, startX: event.clientX, startY: event.clientY, origin, didDrag: false };
    event.currentTarget.setPointerCapture?.(event.pointerId);
  }

  function pointerMove(event: ReactPointerEvent<HTMLAnchorElement>) {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    const deltaX = event.clientX - drag.startX;
    const deltaY = event.clientY - drag.startY;
    if (!drag.didDrag && Math.hypot(deltaX, deltaY) < DRAG_THRESHOLD) return;
    if (!drag.didDrag) {
      drag.didDrag = true;
      setIsDragging(true);
    }
    event.preventDefault();
    movePosition({ left: drag.origin.left + deltaX, top: drag.origin.top + deltaY }, false);
  }

  function pointerEnd(event: ReactPointerEvent<HTMLAnchorElement>) {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    if (drag.didDrag) {
      suppressClickRef.current = true;
      if (positionRef.current) writeStoredPosition(positionRef.current);
      window.setTimeout(() => { suppressClickRef.current = false; }, 0);
    }
    dragRef.current = null;
    setIsDragging(false);
    if (event.currentTarget.hasPointerCapture?.(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
  }

  function keyDown(event: React.KeyboardEvent<HTMLAnchorElement>) {
    // A later keyboard activation must never inherit suppression from an older drag.
    if (event.key === "Enter") {
      suppressClickRef.current = false;
      return;
    }
    if (event.key === "Home") {
      event.preventDefault();
      updatePosition(null);
      clearStoredPosition();
      return;
    }
    const deltas: Record<string, FloatingPosition> = {
      ArrowUp: { left: 0, top: -KEYBOARD_STEP },
      ArrowDown: { left: 0, top: KEYBOARD_STEP },
      ArrowLeft: { left: -KEYBOARD_STEP, top: 0 },
      ArrowRight: { left: KEYBOARD_STEP, top: 0 },
    };
    const delta = deltas[event.key];
    if (!delta) return;
    event.preventDefault();
    const current = currentPosition();
    movePosition({ left: current.left + delta.left, top: current.top + delta.top });
  }

  function click(event: React.MouseEvent<HTMLAnchorElement>) {
    if (!suppressClickRef.current) return;
    event.preventDefault();
    event.stopPropagation();
    suppressClickRef.current = false;
  }

  if (/^\/(admin|ops|finance|staff|api)(\/|$)/.test(pathname)) return null;

  const style: CSSProperties = position ? {
    left: `clamp(env(safe-area-inset-left, 20px), ${position.left}px, calc(100vw - 56px - env(safe-area-inset-right, 20px)))`,
    top: `clamp(env(safe-area-inset-top, 20px), ${position.top}px, calc(100dvh - 56px - env(safe-area-inset-bottom, 24px)))`,
    insetInlineEnd: "auto",
    bottom: "auto",
  } : {
    bottom: `max(${pathname.startsWith("/listings/") ? "var(--ch-whatsapp-room-offset, 24px)" : "24px"}, ${noticeOffset}px, calc(24px + env(safe-area-inset-bottom)))`,
  };

  return <>
    <a
      ref={widgetRef}
      href={CAMPUSHOMES_CONTACT.whatsappHref}
      target="_blank"
      rel="noopener noreferrer"
      draggable={false}
      className={`ch-whatsapp-float ${pathname.startsWith("/listings/") ? "ch-whatsapp-float--listing" : ""}`}
      style={style}
      data-dragging={isDragging ? "true" : undefined}
      aria-label="Chat with CampusHomes on WhatsApp (opens in a new tab)"
      aria-describedby="ch-whatsapp-float-instructions"
      aria-keyshortcuts="ArrowUp ArrowDown ArrowLeft ArrowRight Home"
      title="Chat with CampusHomes on WhatsApp · Drag to move"
      onPointerDown={pointerDown}
      onPointerMove={pointerMove}
      onPointerUp={pointerEnd}
      onPointerCancel={pointerEnd}
      onKeyDown={keyDown}
      onClick={click}
    >
      {/* Locally served Simple Icons brand asset; no third-party widget or script. */}
      {/* eslint-disable-next-line @next/next/no-img-element -- small local SVG brand icon */}
      <img src="/whatsapp.svg" width="28" height="28" alt="" draggable={false} className="size-7 brightness-0 invert" />
    </a>
    <span id="ch-whatsapp-float-instructions" className="ch-whatsapp-float__instruction">
      Drag to reposition. Use the arrow keys to move this shortcut, or press Home to reset it.
    </span>
  </>;
}
