"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { SendHorizonal, Sparkles } from "lucide-react";
import Link from "next/link";

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
      setError(apiErrorMessage(err, "CampusHomes AI couldn't answer just now. Try again, or use the manual or Contact Us page."));
    } finally {
      setIsSending(false);
    }
  }

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    void ask(draft);
  }

  return (
    <section aria-label="CampusHomes AI" className="ch-support-chat flex flex-col overflow-hidden rounded-xl border border-border bg-card">
      <header className="ch-support-chat-header flex items-start gap-3 border-b border-border px-4 py-4 sm:px-6 sm:py-5">
        <span className="grid size-10 shrink-0 place-items-center rounded-full bg-primary/10 text-primary">
          <Sparkles aria-hidden className="size-5" />
        </span>
        <div className="min-w-0 pt-0.5">
          <p className="font-display text-base font-semibold leading-6 text-foreground sm:text-lg">CampusHomes AI</p>
          <p className="ch-support-chat-disclosure text-xs leading-5 text-muted-foreground">
            AI support assistant · answers come from our user manual
          </p>
        </div>
      </header>

      <div
        ref={logRef}
        role="log"
        aria-live="polite"
        className="ch-support-chat-log max-h-[26.25rem] min-h-[13.75rem] space-y-3 overflow-y-auto p-5 sm:space-y-4 sm:p-6"
      >
        <Bubble role="assistant">{GREETING}</Bubble>
        {messages.length === 0 && (
          <div className="ch-support-chat-suggestions flex flex-wrap gap-2 pt-1">
            {SUGGESTIONS.map((suggestion) => (
              <button
                key={suggestion}
                type="button"
                onClick={() => void ask(suggestion)}
                disabled={isSending}
                className="ch-support-chat-suggestion inline-flex min-h-11 items-center rounded-full border border-border bg-card px-3 text-left text-sm text-primary transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:pointer-events-none disabled:opacity-50"
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

      <form onSubmit={handleSubmit} className="ch-support-chat-composer flex items-end gap-2 border-t border-border p-4 sm:p-5">
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
          className="max-h-36 min-h-11 flex-1 resize-none field-sizing-content text-base sm:text-sm"
        />
        <Button type="submit" disabled={isSending || !draft.trim()} aria-label="Send" className="min-h-11 min-w-11 shrink-0">
          <span className="hidden sm:inline">Send</span>
          <SendHorizonal aria-hidden />
        </Button>
      </form>
      <p className="ch-support-chat-disclosure px-4 pb-4 text-xs leading-5 text-muted-foreground sm:px-5 sm:pb-5">
        AI answers may be wrong and can&apos;t access your account. For reservation help, visit <Link href="/contact" className="font-semibold text-primary underline underline-offset-4">Contact Us</Link>.
      </p>
    </section>
  );
}

function Bubble({ role, children }: { role: Message["role"]; children: React.ReactNode }) {
  return (
    <p
      className={cn(
        "ch-support-chat-bubble max-w-[90%] break-words whitespace-pre-wrap rounded-2xl px-4 py-3 text-sm leading-6 shadow-xs sm:max-w-[82%]",
        role === "user" ? "ml-auto bg-primary text-primary-foreground" : "ch-support-chat-bubble--assistant border border-border bg-muted text-foreground",
      )}
    >
      {children}
    </p>
  );
}
