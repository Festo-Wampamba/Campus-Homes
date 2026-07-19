import type { Metadata } from "next";
import { Suspense } from "react";
import { redirect } from "next/navigation";

import { ChatInbox } from "@/components/chat/chat-inbox";
import { getMyThreads } from "@/lib/chat";
import { getServerSession } from "@/lib/session";

export const metadata: Metadata = { title: "Messages" };

export default async function LandlordMessagesPage() {
  const session = await getServerSession();
  if (!session) redirect("/sign-in");

  const threads = await getMyThreads();

  return (
    <>
      <h1 className="text-2xl">Messages</h1>
      <Suspense fallback={<p className="mt-6 text-sm text-muted-foreground">Loading…</p>}>
        <ChatInbox initialThreads={threads} currentUserId={session.user.id} />
      </Suspense>
    </>
  );
}
