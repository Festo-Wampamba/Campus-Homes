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
import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { getLandlordProfile } from "@/lib/landlord";
import { requireWorkspace } from "@/lib/session";
import { AppShell } from "@/components/shell/app-shell";

// Session access controls workspace entry and the initial onboarding gate.
export default async function LandlordLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const session = await requireWorkspace("landlord");
  const path = (await headers()).get("x-campushomes-path") ?? "/landlord";
  const profile = await getLandlordProfile();
  const isApprovalPage = path === "/landlord/approval-pending";
  const isOnboarding = path.startsWith("/landlord/onboarding");

  // An enrolled identity may complete the two-step application, but no
  // ordinary landlord surface is reachable until an admin verifies it.
  // The API enforces the same boundary for direct requests.
  if (!profile && !isOnboarding) {
    redirect("/landlord/onboarding");
  }
  if (profile && profile.kycStatus !== "verified" && !isApprovalPage && !isOnboarding) {
    redirect("/landlord/approval-pending");
  }
  return (
    <AppShell
      portalLabel="Landlord"
      user={session.user}
      access={session.access}
      homeHref="/landlord"
      notificationsEndpoint="/notifications"
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
