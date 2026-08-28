"use client";

import { useEffect, useRef } from "react";
import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";

import { cn } from "@/lib/utils";

export interface MapBounds {
  minLat: number;
  minLon: number;
  maxLat: number;
  maxLon: number;
}

export interface MapMarker {
  id: string;
  lat: number;
  lon: number;
  label: string;
}

// §20 resolved: MapLibre + OSM raster tiles. Attribution is mandatory under
// the OSM tile usage policy; swap tile servers via NEXT_PUBLIC_TILE_URL.
// `||`, not `??` — a blank `.env.local` placeholder (NEXT_PUBLIC_TILE_URL=)
// is an empty string, not undefined/null, so `??` would silently keep it
// and MapLibre would request tiles from "" (resolves to the current page,
// which isn't a PNG — throws "source image could not be decoded" for every
// tile). Same footgun apps/api's loadEnv() already treats as unset.
const TILE_URL =
  process.env.NEXT_PUBLIC_TILE_URL ||
  "https://tile.openstreetmap.org/{z}/{x}/{y}.png";

const OSM_STYLE: maplibregl.StyleSpecification = {
  version: 8,
  sources: {
    osm: {
      type: "raster",
      tiles: [TILE_URL],
      tileSize: 256,
      attribution:
        '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
    },
  },
  layers: [{ id: "osm", type: "raster", source: "osm" }],
};

// Makerere main campus — the launch catchment (brief §1).
const INITIAL_CENTER: [number, number] = [32.5687, 0.3345];
const INITIAL_ZOOM = 14;

function boundsOf(map: maplibregl.Map): MapBounds {
  const b = map.getBounds();
  return {
    minLat: b.getSouth(),
    minLon: b.getWest(),
    maxLat: b.getNorth(),
    maxLon: b.getEast(),
  };
}

export function ListingsMap({
  markers,
  selectedId,
  onSelect,
  onBoundsChange,
  className,
  initialCenter = INITIAL_CENTER,
  initialZoom = INITIAL_ZOOM,
}: {
  markers: MapMarker[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  onBoundsChange: (bounds: MapBounds) => void;
  className?: string;
  // Lets a caller open the map centered on a specific campus (browse-by-
  // university) instead of the Makerere default — read once, at mount.
  initialCenter?: [number, number];
  initialZoom?: number;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const markerRefs = useRef(new Map<string, maplibregl.Marker>());
  // Latest callbacks without re-initialising the map
  const onSelectRef = useRef(onSelect);
  const onBoundsChangeRef = useRef(onBoundsChange);
  useEffect(() => {
    onSelectRef.current = onSelect;
    onBoundsChangeRef.current = onBoundsChange;
  });
  // Read once at mount, deliberately not kept in sync — the map shouldn't
  // re-center out from under a user who has already panned it.
  const initialCenterRef = useRef(initialCenter);
  const initialZoomRef = useRef(initialZoom);

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    const map = new maplibregl.Map({
      container: containerRef.current,
      style: OSM_STYLE,
      center: initialCenterRef.current,
      zoom: initialZoomRef.current,
      // OSM tile policy requires always-visible attribution — no compact toggle
      attributionControl: false,
      // A plain scroll over the map was hijacking page scroll entirely
      // (MapLibre's default scrollZoom captures the wheel event outright).
      // cooperativeGestures requires ctrl/cmd+scroll to zoom the map (with a
      // brief "use ctrl + scroll to zoom" hint on a plain scroll attempt) and
      // two fingers to pan on touch, so one-finger/plain scroll always falls
      // through to the page as normal.
      cooperativeGestures: true,
    });
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), "top-right");
    map.addControl(new maplibregl.AttributionControl({ compact: false }));

    // Container size changes for reasons MapLibre never sees on its own —
    // the "Hide/show map" toggle collapsing this div's height/width, a
    // sidebar opening, a window resize mid-transition — and a stale canvas
    // size is what makes a WebGL map look cut off or blank after any of
    // those. ResizeObserver catches all of them in one place instead of
    // wiring a resize() call into every caller that can change our size.
    const resizeObserver = new ResizeObserver(() => map.resize());
    resizeObserver.observe(containerRef.current);
    // Bounds come from the camera transform (center/zoom/container size),
    // available the instant the map is constructed — they don't need tiles
    // to have finished downloading. Search must never depend on tile-load
    // success: MapLibre's "load" event specifically waits for the initial
    // viewport's tiles, so gating the first search on it means one slow or
    // blocked OSM request (ad-blocker, flaky network) permanently stalls
    // the results list even though the listings API is fine.
    onBoundsChangeRef.current(boundsOf(map));
    let timer: ReturnType<typeof setTimeout>;
    map.on("moveend", () => {
      clearTimeout(timer);
      timer = setTimeout(() => onBoundsChangeRef.current(boundsOf(map)), 350);
    });
    mapRef.current = map;
    return () => {
      clearTimeout(timer);
      resizeObserver.disconnect();
      map.remove();
      mapRef.current = null;
    };
  }, []);

  // Sync markers (≤50 per search — rebuild is cheap and simple)
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    for (const m of markerRefs.current.values()) m.remove();
    markerRefs.current.clear();
    for (const marker of markers) {
      const el = document.createElement("button");
      el.type = "button";
      el.setAttribute("aria-label", `Show listing: ${marker.label}`);
      el.className =
        "map-pin tabular cursor-pointer rounded-full px-2.5 py-1 text-xs font-semibold shadow-md transition-colors duration-150";
      el.textContent = marker.label;
      el.addEventListener("click", () => onSelectRef.current(marker.id));
      const m = new maplibregl.Marker({ element: el })
        .setLngLat([marker.lon, marker.lat])
        .addTo(map);
      markerRefs.current.set(marker.id, m);
    }
  }, [markers]);

  // Selected pin treatment without rebuilding markers
  useEffect(() => {
    for (const [id, m] of markerRefs.current) {
      m.getElement().dataset.selected = id === selectedId ? "true" : "false";
    }
  }, [selectedId, markers]);

  // min-w-0 overrides flexbox/grid's default min-width:auto — without it, a
  // WebGL canvas reporting its own intrinsic size can force this flex/grid
  // child (and the whole page) wider than the viewport instead of shrinking
  // to fit. overflow-hidden clips the map/controls to this box no matter
  // what size MapLibre's internal canvas thinks it wants to be.
  return <div ref={containerRef} className={cn("min-w-0 overflow-hidden", className)} />;
}
