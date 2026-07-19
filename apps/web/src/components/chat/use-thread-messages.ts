"use client";

import { useEffect, useRef, useState } from "react";
import type { ChatMessage } from "@campushomes/shared";

import { api } from "@/lib/api";

const SOKETI_HOST = process.env.NEXT_PUBLIC_SOKETI_HOST;
const SOKETI_KEY = process.env.NEXT_PUBLIC_SOKETI_KEY;

// Messages endpoint returns newest-first (ChatService.messages, desc sentAt) —
// every place here reverses to oldest-first for chronological rendering.
function chronological(rows: ChatMessage[]): ChatMessage[] {
  return [...rows].reverse();
}

export function useThreadMessages(threadId: string | null) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const seenIds = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (!threadId) {
      seenIds.current = new Set();
      return;
    }

    let cancelled = false;
    seenIds.current = new Set();

    async function loadInitial() {
      const rows = await api<ChatMessage[]>(`/chat/threads/${threadId}/messages`);
      if (cancelled) return;
      const ordered = chronological(rows);
      ordered.forEach((m) => seenIds.current.add(m.id));
      setMessages(ordered);
    }
    loadInitial();

    if (SOKETI_HOST && SOKETI_KEY) {
      const channelName = `private-thread-${threadId}`;
      let pusherClient: import("pusher-js").default | undefined;

      import("pusher-js").then(({ default: Pusher }) => {
        if (cancelled) return;
        pusherClient = new Pusher(SOKETI_KEY, {
          // ponytail: `cluster` is a required Options field but unused here —
          // wsHost/wsPort below point straight at self-hosted Soketi, which
          // doesn't have Pusher SaaS clusters.
          cluster: "soketi",
          wsHost: SOKETI_HOST,
          wsPort: 443,
          forceTLS: true,
          enabledTransports: ["ws", "wss"],
          channelAuthorization: {
            customHandler: (params, callback) => {
              api<{ auth: string }>("/chat/pusher/auth", {
                method: "POST",
                body: JSON.stringify({
                  socket_id: params.socketId,
                  channel_name: params.channelName,
                }),
              })
                .then((data) => callback(null, data))
                .catch((err: Error) => callback(err, null));
            },
          },
        });
        const channel = pusherClient.subscribe(channelName);
        channel.bind("message", (message: ChatMessage) => {
          if (seenIds.current.has(message.id)) return;
          seenIds.current.add(message.id);
          setMessages((prev) => [...prev, message]);
        });
      });

      return () => {
        cancelled = true;
        pusherClient?.unsubscribe(channelName);
        pusherClient?.disconnect();
      };
    }

    const interval = setInterval(async () => {
      try {
        const rows = await api<ChatMessage[]>(`/chat/threads/${threadId}/messages`);
        if (cancelled) return;
        setMessages(chronological(rows));
      } catch {
        // Transient — next tick retries (same pattern as usePaymentPoll).
      }
    }, 4000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [threadId]);

  function appendOptimistic(message: ChatMessage) {
    if (seenIds.current.has(message.id)) return;
    seenIds.current.add(message.id);
    setMessages((prev) => [...prev, message]);
  }

  return { messages: threadId ? messages : [], appendOptimistic };
}
