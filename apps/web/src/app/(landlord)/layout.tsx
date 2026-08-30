import {
  BarChart3,
  Building2,
  Calendar,
  CalendarCheck,
  HelpCircle,
  LayoutDashboard,
  MessageCircle,
  MessageCircleQuestion,
  Star,
  User,
  Users,
  Wallet,
} from "lucide-react";

import { requireRole } from "@/lib/session";
import { AppShell } from "@/components/shell/app-shell";

// Layout only gates on role — kyc_status lives on the landlords table, not
// the session, so the "verified except onboarding routes" gate (brief §13)
// happens per-page: onboarding/page.tsx redirects once a property exists,
// landlord/page.tsx redirects back to onboarding until one does.
export default async function LandlordLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const session = await requireRole(["landlord"]);
  return (
    <AppShell
      portalLabel="Landlord"
      user={session.user}
      homeHref="/landlord"
      nav={[
        { label: "Dashboard", href: "/landlord", icon: <LayoutDashboard aria-hidden className="size-4 shrink-0" /> },
        { label: "My Properties", href: "/landlord/properties", icon: <Building2 aria-hidden className="size-4 shrink-0" /> },
        { label: "Tenants", href: "/landlord/tenants", icon: <Users aria-hidden className="size-4 shrink-0" /> },
        { label: "Bookings", href: "/landlord/bookings", icon: <CalendarCheck aria-hidden className="size-4 shrink-0" /> },
        { label: "Enquiries", href: "/landlord/enquiries", icon: <MessageCircleQuestion aria-hidden className="size-4 shrink-0" /> },
        { label: "Payments & Earnings", href: "/landlord/payments", icon: <Wallet aria-hidden className="size-4 shrink-0" /> },
        { label: "Messages", href: "/landlord/messages", icon: <MessageCircle aria-hidden className="size-4 shrink-0" /> },
        { label: "Calendar", href: "/landlord/calendar", icon: <Calendar aria-hidden className="size-4 shrink-0" /> },
        { label: "Reviews", href: "/landlord/reviews", icon: <Star aria-hidden className="size-4 shrink-0" /> },
        { label: "Reports & Analytics", href: "/landlord/reports", icon: <BarChart3 aria-hidden className="size-4 shrink-0" /> },
        { label: "Support & Help", href: "/landlord/support", icon: <HelpCircle aria-hidden className="size-4 shrink-0" /> },
        { label: "Account Settings", href: "/landlord/profile", icon: <User aria-hidden className="size-4 shrink-0" /> },
      ]}
    >
      {children}
    </AppShell>
  );
}
