import type { Metadata } from "next";
import { Suspense } from "react";
import { redirect } from "next/navigation";

import { ChatInbox } from "@/components/chat/chat-inbox";
import { getMyThreads } from "@/lib/chat";
import { getServerSession } from "@/lib/session";

export const metadata: Metadata = { title: "Messages" };

export default async function StudentMessagesPage() {
  const session = await getServerSession();
  if (!session) redirect("/sign-in");

  const threads = await getMyThreads();

  return (
    <>
      <p className="text-xs font-bold uppercase tracking-[0.16em] text-[#ae5528]">Stay in touch</p>
      <h1 className="ch-student-page__title mt-3">Messages</h1>
      <p className="ch-student-page__lede">Ask a landlord about a room, follow up on a reservation and keep replies in one place.</p>
      <Suspense fallback={<p className="mt-6 text-sm text-muted-foreground">Loading…</p>}>
        <ChatInbox initialThreads={threads} currentUserId={session.user.id} />
      </Suspense>
    </>
  );
}
