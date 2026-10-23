"use client";

import { useRef, useState, type KeyboardEvent } from "react";
import { ArrowUpRight, BookOpen, Sparkles } from "lucide-react";

import Link from "next/link";

import { AssistantChat } from "./assistant-chat";
import { UserManual } from "./user-manual";

const SUPPORT_TABS = ["ai", "manual"] as const;
export type SupportTab = (typeof SUPPORT_TABS)[number];

// Phones show the short label so two tabs fit one line at 375px.
const TAB_LABELS: Record<SupportTab, { label: string; short: string; icon: typeof Sparkles }> = {
  ai: { label: "Ask CampusHomes AI", short: "Ask AI", icon: Sparkles },
  manual: { label: "User manual", short: "Manual", icon: BookOpen },
};

export function SupportTabs({
  initialTab,
}: {
  initialTab: SupportTab;
}) {
  const [tab, setTab] = useState<SupportTab>(initialTab);
  const tabRefs = useRef<Record<SupportTab, HTMLButtonElement | null>>({ ai: null, manual: null });

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
    <div className="ch-support-tools">
      <header className="ch-support-tools__heading print:hidden">
        <h2>Choose your help tool</h2>
        <Link href="/contact">Contact Us<ArrowUpRight aria-hidden /></Link>
      </header>

      <div
        role="tablist"
        aria-label="Support options"
        onKeyDown={handleKeyDown}
        className="ch-support-tabs print:hidden"
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
              className="ch-support-tab"
            >
              <Icon aria-hidden className="size-4 shrink-0" />
              <span className="sm:hidden">{short}</span>
              <span className="hidden sm:inline">{label}</span>
            </button>
          );
        })}
      </div>

      <div role="tabpanel" id={`support-panel-${tab}`} aria-labelledby={`support-tab-${tab}`} tabIndex={0} className="ch-support-panel">
        {tab === "ai" && <AssistantChat />}
        {tab === "manual" && <UserManual />}
      </div>
    </div>
  );
}
