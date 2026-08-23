import { Building2, ClipboardCheck, ClipboardList, Image as ImageIcon, ShieldAlert, UserCheck, UserPlus } from "lucide-react";

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
              // Lets a lead self-assign and run a visit end-to-end with no
              // separate inspector (MVP full-parity decision) — the same
              // checklist screen an inspector uses, reachable from the
              // lead's own nav instead of being inspector-only.
              { label: "My visits", href: "/ops/inspect", icon: <ClipboardList aria-hidden className="size-4 shrink-0" /> },
              { label: "Properties", href: "/ops/properties", icon: <Building2 aria-hidden className="size-4 shrink-0" /> },
              { label: "Landlord KYC", href: "/ops/landlords", icon: <UserCheck aria-hidden className="size-4 shrink-0" /> },
              { label: "Onboarding leads", href: "/ops/leads", icon: <UserPlus aria-hidden className="size-4 shrink-0" /> },
              { label: "Issue strike", href: "/ops/strikes", icon: <ShieldAlert aria-hidden className="size-4 shrink-0" /> },
              { label: "Campus photos", href: "/ops/campuses", icon: <ImageIcon aria-hidden className="size-4 shrink-0" /> },
            ]
      }
      // A lead can now also run the offline-capable checklist flow
      // (MVP full-parity decision) — not just an inspector — so the sync
      // manager/indicator has to start for them too, not just isInspector.
      headerExtra={<SyncStatusIndicator />}
    >
      {children}
    </AppShell>
  );
}
