"use client";

import { useEffect, useState } from "react";
import { Wifi, WifiOff } from "lucide-react";

import { startSyncManager } from "@/lib/ops/sync-manager";
import { cn } from "@/lib/utils";

/** Mounted once in the ops layout for inspectors — starts the sync manager
 * for the lifetime of any (ops) page and shows connectivity state. */
function SyncStatusIndicator() {
  const [online, setOnline] = useState(true);

  useEffect(() => {
    setOnline(navigator.onLine);
    const goOnline = () => setOnline(true);
    const goOffline = () => setOnline(false);
    window.addEventListener("online", goOnline);
    window.addEventListener("offline", goOffline);
    const stopSync = startSyncManager();
    return () => {
      window.removeEventListener("online", goOnline);
      window.removeEventListener("offline", goOffline);
      stopSync();
    };
  }, []);

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
