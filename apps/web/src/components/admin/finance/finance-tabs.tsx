"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { cn } from "@/lib/utils";

const TABS = [
  { href: "/admin/finance", label: "Overview" },
  { href: "/admin/finance/profit-loss", label: "Profit & loss" },
  { href: "/admin/finance/balance-sheet", label: "Balance sheet" },
  { href: "/admin/finance/accounts", label: "Chart of accounts" },
];

export function FinanceTabs() {
  const pathname = usePathname();
  return (
    <nav aria-label="Finance sections" className="mb-5 flex flex-wrap gap-1 border-b border-slate-200 dark:border-border">
      {TABS.map((tab) => {
        const active = pathname === tab.href;
        return (
          <Link
            key={tab.href}
            href={tab.href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "-mb-px border-b-2 px-3.5 py-2.5 text-sm font-bold transition-colors",
              active
                ? "border-teal-600 text-teal-700 dark:text-teal-400"
                : "border-transparent text-slate-500 hover:text-slate-800 dark:text-muted-foreground dark:hover:text-foreground",
            )}
          >
            {tab.label}
          </Link>
        );
      })}
    </nav>
  );
}
