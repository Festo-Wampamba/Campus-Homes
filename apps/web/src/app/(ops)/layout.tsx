import { requireRole } from "@/lib/session";
import { PortalShell } from "@/components/shell/portal-shell";
import { SyncStatusIndicator } from "@/components/ops/sync-status-indicator";

export default async function OpsLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const session = await requireRole(["ops_inspector", "ops_lead", "admin"]);
  const isInspector = session.user.role === "ops_inspector";

  return (
    <PortalShell
      portalLabel={isInspector ? "Ops · Inspector" : "Ops · Lead"}
      user={session.user}
      nav={
        isInspector
          ? [{ label: "My visits", href: "/ops/inspect" }]
          : [
              { label: "Verification queue", href: "/ops" },
              { label: "Issue strike", href: "/ops/strikes" },
            ]
      }
      headerExtra={isInspector ? <SyncStatusIndicator /> : undefined}
    >
      {children}
    </PortalShell>
  );
}
