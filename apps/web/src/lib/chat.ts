import type { ChatThread } from "@campushomes/shared";

import { apiServer } from "@/lib/server-api";

export function getMyThreads(): Promise<ChatThread[]> {
  return apiServer<ChatThread[]>("/chat/threads").then((rows) => rows ?? []);
}
