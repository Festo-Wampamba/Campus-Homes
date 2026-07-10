import { requireRole } from "@/lib/session";
import { PortalShell } from "@/components/shell/portal-shell";

export default async function OpsLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const session = await requireRole(["ops_inspector", "ops_lead", "admin"]);
  return (
    <PortalShell
      portalLabel={session.user.role === "ops_inspector" ? "Ops · Inspector" : "Ops · Lead"}
      user={session.user}
      nav={[{ label: "Verification queue", href: "/ops" }]}
    >
      {children}
    </PortalShell>
  );
}
