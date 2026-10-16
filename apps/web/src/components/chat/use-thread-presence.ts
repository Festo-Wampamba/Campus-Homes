"use client";

import { useEffect, useState } from "react";
import type { ThreadPresence } from "@campushomes/shared";

import { api } from "@/lib/api";

const POLL_MS = 4000;

/** The other person in the open conversation: online, last seen, typing. Polled while visible. */
export function useThreadPresence(threadId: string | null): ThreadPresence | null {
  // Keyed by thread so switching conversations never shows the previous person's status.
  const [state, setState] = useState<{ threadId: string; presence: ThreadPresence } | null>(null);

  useEffect(() => {
    if (!threadId) return;
    let cancelled = false;
    const load = () => {
      if (document.hidden) return;
      api<ThreadPresence>(`/chat/threads/${threadId}/presence`)
        .then((presence) => {
          if (!cancelled) setState({ threadId, presence });
        })
        .catch(() => undefined);
    };
    load();
    const interval = setInterval(load, POLL_MS);
    document.addEventListener("visibilitychange", load);
    return () => {
      cancelled = true;
      clearInterval(interval);
      document.removeEventListener("visibilitychange", load);
    };
  }, [threadId]);

  return state && state.threadId === threadId ? state.presence : null;
}
