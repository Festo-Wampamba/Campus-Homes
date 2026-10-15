"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { SendHorizonal, Sparkles } from "lucide-react";

import { supportAskResponseSchema } from "@campushomes/shared";

import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { api, apiErrorMessage } from "@/lib/api";
import { cn } from "@/lib/utils";

type Message = { role: "user" | "assistant"; content: string };

const GREETING =
  "Hi, I'm CampusHomes AI. Ask me how to find a room, reserve or book one, message a landlord, or list your hostel.";
const SUGGESTIONS = [
  "What is the difference between reserving and booking?",
  "How long is a room held for me?",
  "How do I list my hostel?",
];
// Mirrors supportAskSchema: 12 messages of up to 1,000 characters each.
const MAX_HISTORY = 12;
const MAX_CHARS = 1000;

export function AssistantChat() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [draft, setDraft] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const logRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const log = logRef.current;
    if (log) log.scrollTop = log.scrollHeight;
  }, [messages, isSending]);

  async function ask(question: string) {
    const trimmed = question.trim();
    if (!trimmed || isSending) return;
    const next: Message[] = [...messages, { role: "user", content: trimmed }];
    setMessages(next);
    setDraft("");
    setError(null);
    setIsSending(true);
    try {
      const history = next.slice(-MAX_HISTORY).map((m) => ({ ...m, content: m.content.slice(0, MAX_CHARS) }));
      const { reply } = supportAskResponseSchema.parse(
        await api<unknown>("/support/ask", { method: "POST", body: JSON.stringify({ messages: history }) }),
      );
      setMessages([...next, { role: "assistant", content: reply }]);
    } catch (err) {
      setError(apiErrorMessage(err, "CampusHomes AI couldn't answer just now. Try again, or use the manual or Contact tab."));
    } finally {
      setIsSending(false);
    }
  }

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    void ask(draft);
  }

  return (
    <section aria-label="CampusHomes AI" className="flex flex-col overflow-hidden rounded-xl border border-border bg-card">
      <header className="flex items-center gap-3 border-b border-border px-5 py-4">
        <span className="grid size-10 place-items-center rounded-full bg-teal-50 text-teal-700">
          <Sparkles aria-hidden className="size-5" />
        </span>
        <div>
          <p className="font-display font-semibold">CampusHomes AI</p>
          <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <span aria-hidden className="size-2 rounded-full bg-success" />
            AI support assistant · answers come from our user manual
          </p>
        </div>
      </header>

      <div ref={logRef} role="log" aria-live="polite" className="max-h-[28rem] min-h-72 space-y-3 overflow-y-auto p-4 sm:p-5">
        <Bubble role="assistant">{GREETING}</Bubble>
        {messages.length === 0 && (
          <div className="flex flex-wrap gap-2 pt-1">
            {SUGGESTIONS.map((suggestion) => (
              <button
                key={suggestion}
                type="button"
                onClick={() => void ask(suggestion)}
                className="rounded-full border border-border px-3 py-1.5 text-left text-sm text-teal-700 transition-colors hover:bg-teal-50 dark:text-teal-300"
              >
                {suggestion}
              </button>
            ))}
          </div>
        )}
        {messages.map((message, i) => (
          <Bubble key={i} role={message.role}>
            {message.content}
          </Bubble>
        ))}
        {isSending && <Bubble role="assistant">Thinking…</Bubble>}
        {error && (
          <p role="alert" className="rounded-lg bg-destructive-subtle px-3 py-2 text-sm text-destructive">
            {error}
          </p>
        )}
      </div>

      <form onSubmit={handleSubmit} className="flex items-end gap-2 border-t border-border p-3 sm:p-4">
        <Textarea
          aria-label="Ask CampusHomes AI"
          placeholder="Ask a question…"
          value={draft}
          maxLength={MAX_CHARS}
          rows={1}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              void ask(draft);
            }
          }}
          className="max-h-36 min-h-11 flex-1 resize-none field-sizing-content"
        />
        <Button type="submit" disabled={isSending || !draft.trim()} aria-label="Send">
          <SendHorizonal aria-hidden />
        </Button>
      </form>
      <p className="px-4 pb-3 text-xs text-muted-foreground sm:px-5">
        CampusHomes AI can make mistakes and can&apos;t see your account. For anything about a specific
        reservation, use the Contact tab.
      </p>
    </section>
  );
}

function Bubble({ role, children }: { role: Message["role"]; children: React.ReactNode }) {
  return (
    <p
      className={cn(
        "max-w-[85%] whitespace-pre-wrap rounded-2xl px-4 py-2.5 text-sm leading-6",
        role === "user" ? "ml-auto bg-teal-900 text-white" : "bg-muted text-foreground",
      )}
    >
      {children}
    </p>
  );
}
