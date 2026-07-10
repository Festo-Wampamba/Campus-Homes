"use client";

import { useEffect, useRef } from "react";
import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";

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
const TILE_URL =
  process.env.NEXT_PUBLIC_TILE_URL ??
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
}: {
  markers: MapMarker[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  onBoundsChange: (bounds: MapBounds) => void;
  className?: string;
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

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    const map = new maplibregl.Map({
      container: containerRef.current,
      style: OSM_STYLE,
      center: INITIAL_CENTER,
      zoom: INITIAL_ZOOM,
      // OSM tile policy requires always-visible attribution — no compact toggle
      attributionControl: false,
    });
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }));
    map.addControl(new maplibregl.AttributionControl({ compact: false }));
    map.on("load", () => onBoundsChangeRef.current(boundsOf(map)));
    let timer: ReturnType<typeof setTimeout>;
    map.on("moveend", () => {
      clearTimeout(timer);
      timer = setTimeout(() => onBoundsChangeRef.current(boundsOf(map)), 350);
    });
    mapRef.current = map;
    return () => {
      clearTimeout(timer);
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

  return <div ref={containerRef} className={className} />;
}
