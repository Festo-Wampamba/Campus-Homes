import { Calendar, CalendarCheck, Clock, Heart, LifeBuoy, MessageCircle, Search, User } from "lucide-react";

import { requireRole } from "@/lib/session";
import { AppShell } from "@/components/shell/app-shell";

export default async function StudentLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const session = await requireRole(["student"]);
  return (
    <AppShell
      portalLabel="Student"
      user={session.user}
      homeHref="/"
      nav={[
        { label: "Find housing", href: "/search", icon: <Search aria-hidden className="size-4 shrink-0" /> },
        { label: "My reservations", href: "/reservations", icon: <CalendarCheck aria-hidden className="size-4 shrink-0" /> },
        { label: "Messages", href: "/messages", icon: <MessageCircle aria-hidden className="size-4 shrink-0" /> },
        { label: "Favourites", href: "/saved", icon: <Heart aria-hidden className="size-4 shrink-0" /> },
        { label: "Recently viewed", href: "/recently-viewed", icon: <Clock aria-hidden className="size-4 shrink-0" /> },
        { label: "Calendar", href: "/calendar", icon: <Calendar aria-hidden className="size-4 shrink-0" /> },
        { label: "Profile", href: "/profile", icon: <User aria-hidden className="size-4 shrink-0" /> },
        { label: "Support", href: "/support", icon: <LifeBuoy aria-hidden className="size-4 shrink-0" /> },
      ]}
    >
      {children}
    </AppShell>
  );
}
