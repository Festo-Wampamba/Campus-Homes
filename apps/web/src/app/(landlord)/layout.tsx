import { Building2, Calendar, CalendarCheck, MessageCircle, User } from "lucide-react";

import { requireRole } from "@/lib/session";
import { SidebarShell } from "@/components/shell/sidebar-shell";

// Layout only gates on role — kyc_status lives on the landlords table, not
// the session, so the "verified except onboarding routes" gate (brief §13)
// happens per-page: onboarding/page.tsx redirects once a property exists,
// landlord/page.tsx redirects back to onboarding until one does.
export default async function LandlordLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const session = await requireRole(["landlord"]);
  return (
    <SidebarShell
      portalLabel="Landlord"
      user={session.user}
      nav={[
        { label: "My properties", href: "/landlord", icon: <Building2 aria-hidden className="size-4 shrink-0" /> },
        { label: "Reservations", href: "/landlord/reservations", icon: <CalendarCheck aria-hidden className="size-4 shrink-0" /> },
        { label: "Messages", href: "/landlord/messages", icon: <MessageCircle aria-hidden className="size-4 shrink-0" /> },
        { label: "Calendar", href: "/landlord/calendar", icon: <Calendar aria-hidden className="size-4 shrink-0" /> },
        { label: "Profile", href: "/landlord/profile", icon: <User aria-hidden className="size-4 shrink-0" /> },
      ]}
    >
      {children}
    </SidebarShell>
  );
}
