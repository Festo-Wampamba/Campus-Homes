import { ClipboardCheck, ClipboardList, Image as ImageIcon, ShieldAlert, UserCheck } from "lucide-react";

import { requireRole } from "@/lib/session";
import { AppShell } from "@/components/shell/app-shell";
import { SyncStatusIndicator } from "@/components/ops/sync-status-indicator";

export default async function OpsLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const session = await requireRole(["ops_inspector", "ops_lead", "admin"]);
  const isInspector = session.user.role === "ops_inspector";

  return (
    <AppShell
      portalLabel={isInspector ? "Ops · Inspector" : "Ops · Lead"}
      user={session.user}
      homeHref={isInspector ? "/ops/inspect" : "/ops"}
      nav={
        isInspector
          ? [{ label: "My visits", href: "/ops/inspect", icon: <ClipboardList aria-hidden className="size-4 shrink-0" /> }]
          : [
              { label: "Verification queue", href: "/ops", icon: <ClipboardCheck aria-hidden className="size-4 shrink-0" /> },
              { label: "Landlord KYC", href: "/ops/landlords", icon: <UserCheck aria-hidden className="size-4 shrink-0" /> },
              { label: "Issue strike", href: "/ops/strikes", icon: <ShieldAlert aria-hidden className="size-4 shrink-0" /> },
              { label: "Campus photos", href: "/ops/campuses", icon: <ImageIcon aria-hidden className="size-4 shrink-0" /> },
            ]
      }
      headerExtra={isInspector ? <SyncStatusIndicator /> : undefined}
    >
      {children}
    </AppShell>
  );
}
