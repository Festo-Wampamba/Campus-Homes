import { requireRole } from "@/lib/session";
import { PortalShell } from "@/components/shell/portal-shell";

// Layout only gates on role — kyc_status lives on the landlords table, not
// the session, so the "verified except onboarding routes" gate (brief §13)
// happens per-page: onboarding/page.tsx redirects once a property exists,
// landlord/page.tsx redirects back to onboarding until one does.
export default async function LandlordLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const session = await requireRole(["landlord"]);
  return (
    <PortalShell
      portalLabel="Landlord"
      user={session.user}
      nav={[
        { label: "Dashboard", href: "/landlord" },
        { label: "Reservations", href: "/landlord/reservations" },
        { label: "Messages", href: "/landlord/messages" },
      ]}
    >
      {children}
    </PortalShell>
  );
}
