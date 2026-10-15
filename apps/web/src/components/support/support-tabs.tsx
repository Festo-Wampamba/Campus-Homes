"use client";

import { useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { BookOpen, LifeBuoy, MessageCircle, Sparkles } from "lucide-react";

import { cn } from "@/lib/utils";

import { AssistantChat } from "./assistant-chat";
import { ContactPanel } from "./contact-panel";
import { UserManual } from "./user-manual";

const SUPPORT_TABS = ["ai", "contact", "manual"] as const;
export type SupportTab = (typeof SUPPORT_TABS)[number];

// Phones show the short label so three tabs fit one line at 375px.
const TAB_LABELS: Record<SupportTab, { label: string; short: string; icon: typeof Sparkles }> = {
  ai: { label: "Ask CampusHomes AI", short: "Ask AI", icon: Sparkles },
  contact: { label: "Contact", short: "Contact", icon: MessageCircle },
  manual: { label: "User manual", short: "Manual", icon: BookOpen },
};

export function SupportTabs({
  initialTab,
  email,
  phone,
  desk,
}: {
  initialTab: SupportTab;
  email: string;
  phone: string;
  desk: ReactNode;
}) {
  const [tab, setTab] = useState<SupportTab>(initialTab);
  const tabRefs = useRef<Record<SupportTab, HTMLButtonElement | null>>({ ai: null, contact: null, manual: null });

  function select(next: SupportTab) {
    setTab(next);
    // Keeps the open tab shareable and on reload, without a server round trip.
    window.history.replaceState(null, "", `?tab=${next}`);
  }

  function handleKeyDown(event: KeyboardEvent) {
    if (event.key !== "ArrowRight" && event.key !== "ArrowLeft") return;
    const step = event.key === "ArrowRight" ? 1 : -1;
    const next = SUPPORT_TABS[(SUPPORT_TABS.indexOf(tab) + step + SUPPORT_TABS.length) % SUPPORT_TABS.length]!;
    select(next);
    tabRefs.current[next]?.focus();
  }

  return (
    <div className="space-y-6">
      <header className="print:hidden">
        <h1 className="flex items-center gap-3 text-3xl">
          <LifeBuoy aria-hidden className="size-7 text-teal-700 dark:text-teal-300" />
          Support
        </h1>
        <p className="mt-2 text-muted-foreground">
          Get help from CampusHomes AI, chat with our team on WhatsApp, or browse the user manual.
        </p>
      </header>

      <div
        role="tablist"
        aria-label="Support options"
        onKeyDown={handleKeyDown}
        className="grid grid-cols-3 gap-1 rounded-lg bg-muted p-1 sm:inline-grid sm:w-auto print:hidden"
      >
        {SUPPORT_TABS.map((key) => {
          const { label, short, icon: Icon } = TAB_LABELS[key];
          const isActive = tab === key;
          return (
            <button
              key={key}
              ref={(el) => {
                tabRefs.current[key] = el;
              }}
              type="button"
              role="tab"
              id={`support-tab-${key}`}
              aria-selected={isActive}
              aria-controls={`support-panel-${key}`}
              aria-label={label}
              tabIndex={isActive ? 0 : -1}
              onClick={() => select(key)}
              className={cn(
                "flex min-h-11 items-center justify-center gap-2 rounded-md px-3 py-2 text-sm font-semibold transition-colors sm:px-5",
                isActive ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground",
              )}
            >
              <Icon aria-hidden className="size-4 shrink-0" />
              <span className="sm:hidden">{short}</span>
              <span className="hidden sm:inline">{label}</span>
            </button>
          );
        })}
      </div>

      <div role="tabpanel" id={`support-panel-${tab}`} aria-labelledby={`support-tab-${tab}`}>
        {tab === "ai" && <AssistantChat />}
        {tab === "contact" && (
          <ContactPanel
            email={email}
            phone={phone}
            desk={desk}
            onAskAi={() => select("ai")}
            onOpenManual={() => select("manual")}
          />
        )}
        {tab === "manual" && <UserManual />}
      </div>
    </div>
  );
}
