"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { MessageCircle } from "lucide-react";
import type { ChatThread } from "@campushomes/shared";

import { Button } from "@/components/ui/button";
import { api } from "@/lib/api";

// One thread per reservation, provisioned server-side (ChatService.ensureThread) —
// this always resolves to the same thread on repeat clicks, never creates a
// second one (chat_threads has a unique index on reservation_id).
export function MessageButton({
  reservationId,
  messagesHref,
}: {
  reservationId: string;
  messagesHref: string;
}) {
  const router = useRouter();
  const [pending, setPending] = useState(false);

  async function openThread() {
    setPending(true);
    try {
      const thread = await api<ChatThread>(`/chat/threads/${reservationId}`, {
        method: "POST",
      });
      router.push(`${messagesHref}?thread=${thread.id}`);
    } finally {
      setPending(false);
    }
  }

  return (
    <Button type="button" variant="secondary" size="sm" disabled={pending} onClick={openThread}>
      <MessageCircle aria-hidden />
      {pending ? "Opening…" : "Message"}
    </Button>
  );
}
