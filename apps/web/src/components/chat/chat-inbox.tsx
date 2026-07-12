"use client";

import { useState } from "react";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import type { ChatMessage, ChatThread } from "@campushomes/shared";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { api } from "@/lib/api";
import { cn } from "@/lib/utils";
import { useThreadMessages } from "./use-thread-messages";

function formatThreadTime(iso: string | null): string {
  if (!iso) return "";
  return new Date(iso).toLocaleString("en-UG", { dateStyle: "medium", timeStyle: "short" });
}

function Composer({
  threadId,
  onSent,
}: {
  threadId: string;
  onSent: (message: ChatMessage) => void;
}) {
  const [body, setBody] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function send() {
    if (pending) return;
    const trimmed = body.trim();
    if (!trimmed) return;
    setPending(true);
    setError(null);
    try {
      const message = await api<ChatMessage>(`/chat/threads/${threadId}/messages`, {
        method: "POST",
        body: JSON.stringify({ body: trimmed }),
      });
      onSent(message);
      setBody("");
    } catch {
      // Keep the draft so the student/landlord doesn't retype it.
      setError("Message failed to send. Try again.");
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="flex flex-col gap-2 border-t border-border p-4">
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      <div className="flex gap-2">
        <Textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder="Write a message…"
          aria-label="Message"
          className="min-h-11 flex-1"
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              send();
            }
          }}
        />
        <Button type="button" onClick={send} disabled={pending || !body.trim()}>
          {pending ? "Sending…" : "Send"}
        </Button>
      </div>
    </div>
  );
}

export function ChatInbox({
  initialThreads,
  currentUserId,
}: {
  initialThreads: ChatThread[];
  currentUserId: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const sortedThreads = [...initialThreads].sort((a, b) =>
    (b.lastMessageAt ?? "").localeCompare(a.lastMessageAt ?? ""),
  );
  const activeThreadId = searchParams.get("thread") ?? sortedThreads[0]?.id ?? null;
  const { messages, appendOptimistic } = useThreadMessages(activeThreadId);

  function selectThread(id: string) {
    router.push(`${pathname}?thread=${id}`);
  }

  return (
    <div className="mt-6 grid gap-4 sm:grid-cols-[280px_1fr]">
      <Card className="overflow-hidden">
        <div className="divide-y divide-border">
          {sortedThreads.length === 0 && (
            <p className="p-4 text-sm text-muted-foreground">No conversations yet.</p>
          )}
          {sortedThreads.map((thread) => (
            <button
              key={thread.id}
              type="button"
              onClick={() => selectThread(thread.id)}
              className={cn(
                "block w-full px-4 py-3 text-left text-sm hover:bg-muted",
                thread.id === activeThreadId && "bg-accent",
              )}
            >
              <span className="font-semibold text-foreground">Reservation chat</span>
              <span className="block text-xs text-muted-foreground">
                {formatThreadTime(thread.lastMessageAt)}
              </span>
            </button>
          ))}
        </div>
      </Card>
      <Card className="flex min-h-[28rem] flex-col overflow-hidden">
        {!activeThreadId ? (
          <CardContent className="flex flex-1 items-center justify-center p-5 text-sm text-muted-foreground">
            Select a conversation.
          </CardContent>
        ) : (
          <>
            <div className="flex-1 space-y-3 overflow-y-auto p-4">
              {messages.map((message) => (
                <div
                  key={message.id}
                  className={cn(
                    "max-w-[80%] rounded-lg px-3 py-2 text-sm",
                    message.fromUserId === currentUserId
                      ? "ml-auto bg-primary text-primary-foreground"
                      : "bg-muted text-foreground",
                  )}
                >
                  {message.body}
                  <span className="mt-1 block text-xs opacity-70">
                    {formatThreadTime(message.sentAt)}
                  </span>
                </div>
              ))}
            </div>
            <Composer threadId={activeThreadId} onSent={appendOptimistic} />
          </>
        )}
      </Card>
    </div>
  );
}
