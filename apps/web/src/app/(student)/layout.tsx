import { requireRole } from "@/lib/session";
import { PortalShell } from "@/components/shell/portal-shell";

export default async function StudentLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const session = await requireRole(["student"]);
  return (
    <PortalShell
      portalLabel="Student"
      user={session.user}
      nav={[
        { label: "Find housing", href: "/search" },
        { label: "My reservations", href: "/reservations" },
      ]}
    >
      {children}
    </PortalShell>
  );
}
