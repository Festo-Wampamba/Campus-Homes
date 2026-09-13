"use client";

import { useEffect, useMemo, useState } from "react";
import { CheckCheck, MessageSquarePlus, Pencil, Search, Send, X } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import type { ChatContact, ChatMessage, ChatThread } from "@campushomes/shared";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { api, apiErrorMessage } from "@/lib/api";
import { cn } from "@/lib/utils";
import { useThreadMessages } from "./use-thread-messages";

function initials(name: string | null | undefined) {
  return (name || "CH").split(/\s+/).slice(0, 2).map((part) => part[0]).join("").toUpperCase();
}

function relativeTime(iso: string | null) {
  if (!iso) return "";
  const minutes = Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 60_000));
  if (minutes < 1) return "now";
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d`;
  return new Date(iso).toLocaleDateString("en-UG", { month: "short", day: "numeric" });
}

function messageTime(iso: string) {
  return new Date(iso).toLocaleTimeString("en-UG", { hour: "numeric", minute: "2-digit" });
}

function dayLabel(iso: string) {
  const date = new Date(iso);
  const today = new Date();
  if (date.toDateString() === today.toDateString()) return "Today";
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);
  if (date.toDateString() === yesterday.toDateString()) return "Yesterday";
  return date.toLocaleDateString("en-UG", { weekday: "short", month: "short", day: "numeric" });
}

function sameDay(a: string, b: string) {
  return new Date(a).toDateString() === new Date(b).toDateString();
}

function Composer({ threadId, editing, onCancelEdit, onMessage }: {
  threadId: string;
  editing: ChatMessage | null;
  onCancelEdit: () => void;
  onMessage: (message: ChatMessage) => void;
}) {
  const [body, setBody] = useState(editing?.body ?? "");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    const trimmed = body.trim();
    if (!trimmed || pending) return;
    setPending(true);
    setError(null);
    try {
      const path = editing ? `/chat/threads/${threadId}/messages/${editing.id}/edit` : `/chat/threads/${threadId}/messages`;
      const message = await api<ChatMessage>(path, { method: "POST", body: JSON.stringify({ body: trimmed }) });
      onMessage(message);
      setBody("");
      onCancelEdit();
      window.dispatchEvent(new Event("campushomes:notifications-refresh"));
    } catch (caught) {
      setError(apiErrorMessage(caught, editing ? "Could not save your edit." : "Message failed to send."));
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="border-t border-border bg-card p-3 sm:p-4">
      {editing && <div className="mb-2 flex items-center justify-between rounded-lg bg-muted px-3 py-2 text-xs"><span><strong>Editing message</strong> · Esc to cancel</span><button type="button" aria-label="Cancel editing" onClick={onCancelEdit}><X aria-hidden className="size-4" /></button></div>}
      {error && <p role="alert" className="mb-2 text-sm text-destructive">{error}</p>}
      <div className="flex items-end gap-2">
        <Textarea autoFocus={Boolean(editing)} value={body} onChange={(event) => setBody(event.target.value)} placeholder="Write a message…" aria-label="Message" className="max-h-36 min-h-11 resize-none" onKeyDown={(event) => {
          if (event.key === "Escape" && editing) onCancelEdit();
          if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); void submit(); }
        }} />
        <Button type="button" size="icon" aria-label={editing ? "Save edited message" : "Send message"} onClick={() => void submit()} disabled={pending || !body.trim()}>{editing ? <CheckCheck aria-hidden className="size-4" /> : <Send aria-hidden className="size-4" />}</Button>
      </div>
      <p className="mt-1.5 text-[11px] text-muted-foreground">Enter to send · Shift + Enter for a new line</p>
    </div>
  );
}

export function ChatInbox({ initialThreads, currentUserId }: { initialThreads: ChatThread[]; currentUserId: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [threads, setThreads] = useState(initialThreads);
  const [query, setQuery] = useState("");
  const [contacts, setContacts] = useState<ChatContact[] | null>(null);
  const [contactsError, setContactsError] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);
  const [newMessageOpen, setNewMessageOpen] = useState(false);
  const [editing, setEditing] = useState<ChatMessage | null>(null);

  useEffect(() => {
    const refresh = () => api<ChatThread[]>("/chat/threads").then(setThreads).catch(() => undefined);
    const interval = window.setInterval(refresh, 5_000);
    window.addEventListener("campushomes:notifications-refresh", refresh);
    return () => { window.clearInterval(interval); window.removeEventListener("campushomes:notifications-refresh", refresh); };
  }, []);

  const sortedThreads = useMemo(() => [...threads].sort((a, b) => (b.lastMessageAt ?? "").localeCompare(a.lastMessageAt ?? "")), [threads]);
  const filteredThreads = useMemo(() => {
    const term = query.trim().toLowerCase();
    return term ? sortedThreads.filter((thread) => `${thread.counterpartName ?? ""} ${thread.lastMessageSnippet ?? ""}`.toLowerCase().includes(term)) : sortedThreads;
  }, [query, sortedThreads]);
  const activeThreadId = searchParams.get("thread") ?? sortedThreads[0]?.id ?? null;
  const activeThread = threads.find((thread) => thread.id === activeThreadId) ?? null;
  const { messages, appendMessage, replaceMessage } = useThreadMessages(activeThreadId);

  function selectThread(id: string) {
    setEditing(null);
    setThreads((current) => current.map((thread) => thread.id === id ? { ...thread, unreadCount: 0 } : thread));
    router.push(`${pathname}?thread=${id}`);
  }

  async function openNewMessage() {
    setNewMessageOpen(true);
    setContactsError(null);
    if (contacts !== null) return;
    try { setContacts(await api<ChatContact[]>("/chat/contacts")); }
    catch (caught) { setContacts([]); setContactsError(apiErrorMessage(caught, "Could not load contacts.")); }
  }

  async function startConversation(contact: ChatContact) {
    setStarting(true);
    try {
      const thread = await api<ChatThread>("/chat/direct-threads", { method: "POST", body: JSON.stringify({ recipientUserId: contact.userId }) });
      const namedThread = { ...thread, counterpartName: contact.name, counterpartKind: contact.kind };
      setThreads((current) => current.some((item) => item.id === thread.id) ? current.map((item) => item.id === thread.id ? { ...item, ...namedThread } : item) : [namedThread, ...current]);
      setNewMessageOpen(false);
      selectThread(thread.id);
    } catch (caught) { setContactsError(apiErrorMessage(caught, "Could not start this conversation.")); }
    finally { setStarting(false); }
  }

  function handleMessage(message: ChatMessage) {
    if (editing) replaceMessage(message); else appendMessage(message);
    setThreads((current) => current.map((thread) => thread.id === message.threadId ? { ...thread, lastMessageAt: message.sentAt, lastMessageSnippet: message.body } : thread));
  }

  return (
    <div className="mt-6 grid min-h-[34rem] overflow-hidden rounded-xl border border-border bg-card shadow-sm md:grid-cols-[320px_1fr]">
      <aside className="border-b border-border md:border-b-0 md:border-r">
        <div className="space-y-3 border-b border-border p-3">
          <Button type="button" className="w-full" onClick={() => void openNewMessage()}><MessageSquarePlus aria-hidden className="size-4" /> New message</Button>
          <label className="flex h-10 items-center gap-2 rounded-lg border border-border bg-background px-3"><Search aria-hidden className="size-4 text-muted-foreground" /><span className="sr-only">Search conversations</span><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search conversations" className="min-w-0 flex-1 bg-transparent text-sm outline-none" /></label>
        </div>
        <div className="max-h-[34rem] divide-y divide-border overflow-y-auto">
          {!filteredThreads.length && <p className="p-5 text-sm text-muted-foreground">{query ? "No conversations match your search." : "No conversations yet. Select New message to start one."}</p>}
          {filteredThreads.map((thread) => <button key={thread.id} type="button" onClick={() => selectThread(thread.id)} className={cn("flex w-full gap-3 p-3 text-left transition-colors hover:bg-muted", thread.id === activeThreadId && "bg-accent")}>
            <span className="grid size-10 shrink-0 place-items-center rounded-full bg-teal-100 text-xs font-bold text-teal-900">{initials(thread.counterpartName)}</span>
            <span className="min-w-0 flex-1"><span className="flex items-center gap-2"><strong className="truncate text-sm">{thread.counterpartName ?? "CampusHomes user"}</strong><span className="ml-auto shrink-0 text-[11px] text-muted-foreground">{relativeTime(thread.lastMessageAt)}</span></span><span className="mt-0.5 block text-[11px] capitalize text-muted-foreground">{thread.counterpartKind ?? (thread.reservationId ? "Reservation contact" : "Direct contact")}</span><span className="mt-1 flex items-center gap-2"><span className={cn("min-w-0 flex-1 truncate text-xs", thread.unreadCount ? "font-semibold text-foreground" : "text-muted-foreground")}>{thread.lastMessageSnippet ?? "Start the conversation"}</span>{!!thread.unreadCount && <span aria-label={`${thread.unreadCount} unread messages`} className="grid min-w-5 place-items-center rounded-full bg-red-500 px-1.5 py-0.5 text-[10px] font-bold text-white">{thread.unreadCount}</span>}</span></span>
          </button>)}
        </div>
      </aside>
      <section className="flex min-w-0 flex-col">
        {!activeThreadId || !activeThread ? <div className="flex flex-1 flex-col items-center justify-center p-8 text-center"><MessageSquarePlus aria-hidden className="mb-3 size-8 text-muted-foreground" /><p className="font-semibold">Choose a conversation</p><p className="mt-1 text-sm text-muted-foreground">Open an existing chat or start a new message.</p></div> : <>
          <header className="flex items-center gap-3 border-b border-border px-4 py-3"><span className="grid size-10 place-items-center rounded-full bg-teal-100 text-xs font-bold text-teal-900">{initials(activeThread.counterpartName)}</span><span><strong className="block text-sm">{activeThread.counterpartName ?? "CampusHomes user"}</strong><span className="block text-xs capitalize text-muted-foreground">{activeThread.counterpartKind ?? "CampusHomes conversation"}</span></span></header>
          <div className="flex-1 space-y-2 overflow-y-auto bg-muted/25 p-4">
            {!messages.length && <div className="grid h-full place-items-center text-center text-sm text-muted-foreground"><p>No messages yet.<br />Write below to begin the conversation.</p></div>}
            {messages.map((message, index) => { const own = message.fromUserId === currentUserId; const showDay = index === 0 || !sameDay(messages[index - 1].sentAt, message.sentAt); return <div key={message.id}>{showDay && <div className="my-4 flex items-center gap-3 text-[11px] text-muted-foreground before:h-px before:flex-1 before:bg-border after:h-px after:flex-1 after:bg-border">{dayLabel(message.sentAt)}</div>}<div className={cn("group w-fit max-w-[82%] rounded-2xl px-3.5 py-2.5 text-sm shadow-sm", own ? "ml-auto rounded-br-sm bg-teal-700 text-white" : "rounded-bl-sm border border-border bg-card text-foreground")}><p className="whitespace-pre-wrap break-words">{message.body}</p><span className="mt-1 flex items-center justify-end gap-1 text-[10px] opacity-70">{messageTime(message.sentAt)}{message.editedAt ? " · edited" : ""}{own && <CheckCheck aria-label={message.readAt ? "Read" : "Sent"} className={cn("size-3", message.readAt && "text-cyan-200")} />}</span>{own && <button type="button" onClick={() => setEditing(message)} className="mt-1 hidden items-center gap-1 text-[11px] underline group-hover:inline-flex group-focus-within:inline-flex"><Pencil aria-hidden className="size-3" /> Edit</button>}</div></div>; })}
          </div>
          <Composer key={`${activeThreadId}:${editing?.id ?? "new"}`} threadId={activeThreadId} editing={editing} onCancelEdit={() => setEditing(null)} onMessage={handleMessage} />
        </>}
      </section>
      {newMessageOpen && <div className="fixed inset-0 z-50 grid place-items-center bg-slate-950/55 p-4" onMouseDown={() => setNewMessageOpen(false)}><Card role="dialog" aria-modal="true" aria-label="Start a new conversation" className="w-full max-w-md" onMouseDown={(event) => event.stopPropagation()}><CardContent className="p-5"><div className="flex items-center justify-between"><h2 className="font-display text-lg font-bold">New message</h2><Button variant="ghost" size="icon" aria-label="Close" onClick={() => setNewMessageOpen(false)}><X aria-hidden className="size-4" /></Button></div><p className="mt-1 text-sm text-muted-foreground">Choose an eligible CampusHomes contact.</p>{contactsError && <p role="alert" className="mt-3 text-sm text-destructive">{contactsError}</p>}<div className="mt-4 max-h-80 divide-y divide-border overflow-y-auto rounded-lg border border-border">{contacts === null && <p className="p-4 text-sm text-muted-foreground">Loading contacts…</p>}{contacts?.length === 0 && !contactsError && <p className="p-4 text-sm text-muted-foreground">No eligible contacts yet. A conversation becomes available after an enquiry or reservation, or when a student contacts a verified landlord.</p>}{contacts?.map((contact) => <button key={contact.userId} type="button" disabled={starting} onClick={() => void startConversation(contact)} className="flex w-full items-center gap-3 p-3 text-left hover:bg-muted disabled:opacity-60"><span className="grid size-9 shrink-0 place-items-center rounded-full bg-teal-100 text-xs font-bold text-teal-900">{initials(contact.name)}</span><span><strong className="block text-sm">{contact.name ?? "CampusHomes user"}</strong><span className="block text-xs text-muted-foreground">{contact.context}</span></span></button>)}</div></CardContent></Card></div>}
    </div>
  );
}
