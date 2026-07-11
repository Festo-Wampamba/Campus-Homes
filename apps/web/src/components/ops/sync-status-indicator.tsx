"use client";

import { useEffect, useSyncExternalStore } from "react";
import { Wifi, WifiOff } from "lucide-react";

import { startSyncManager } from "@/lib/ops/sync-manager";
import { cn } from "@/lib/utils";

function subscribeToConnectivity(callback: () => void) {
  window.addEventListener("online", callback);
  window.addEventListener("offline", callback);
  return () => {
    window.removeEventListener("online", callback);
    window.removeEventListener("offline", callback);
  };
}

/** Mounted once in the ops layout for inspectors — starts the sync manager
 * for the lifetime of any (ops) page and shows connectivity state.
 * Connectivity is read via useSyncExternalStore (React's recommended way to
 * subscribe to a browser API) rather than setState-in-effect, which avoids
 * both a hydration mismatch (getServerSnapshot returns true) and the
 * cascading-render lint rule a plain effect+setState would trip. */
function SyncStatusIndicator() {
  const online = useSyncExternalStore(
    subscribeToConnectivity,
    () => navigator.onLine,
    () => true,
  );

  useEffect(() => startSyncManager(), []);

  return (
    <span
      role="status"
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold",
        online ? "bg-success-subtle text-success" : "bg-warning-subtle text-warning",
      )}
    >
      {online ? (
        <Wifi aria-hidden className="size-3.5" />
      ) : (
        <WifiOff aria-hidden className="size-3.5" />
      )}
      {online ? "Online" : "Offline — will sync"}
    </span>
  );
}

export { SyncStatusIndicator };
