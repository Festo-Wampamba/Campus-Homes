import type { Metadata } from "next";
import Link from "next/link";
import { CalendarCheck, Heart, MessageCircle, Search, User } from "lucide-react";

import { MAX_ACTIVE_RESERVATIONS } from "@campushomes/shared";

import { getMyReservations } from "@/lib/reservations";
import { getSavedListings } from "@/lib/saved-listings";
import { getServerSession } from "@/lib/session";
import { formatDateTime } from "@/lib/format";

export const metadata: Metadata = { title: "My dashboard" };

export default async function StudentDashboardPage() {
  const [session, reservations, saved] = await Promise.all([
    getServerSession(),
    getMyReservations(),
    getSavedListings(),
  ]);
  const live = reservations.filter((r) => r.status === "reserved" || r.status === "booked");
  const nextHoldEnd = live
    .map((r) => r.reservedExpiresAt)
    .filter((at): at is string => Boolean(at))
    .sort()[0];
  const firstName = session?.user.name?.trim().split(/\s+/)[0];

  const cards = [
    {
      href: "/reservations",
      icon: CalendarCheck,
      title: "My reservations",
      value: `${live.length} of ${MAX_ACTIVE_RESERVATIONS} active`,
      detail: nextHoldEnd ? `Next hold ends ${formatDateTime(nextHoldEnd)}` : "No rooms on hold",
    },
    { href: "/saved", icon: Heart, title: "Favourites", value: `${saved.length} saved`, detail: "Hostels you saved to compare" },
    { href: "/messages", icon: MessageCircle, title: "Messages", value: "Chat with landlords", detail: "About rooms you reserved" },
    { href: "/profile", icon: User, title: "Profile", value: "Your details", detail: "Name, phone and university" },
  ];

  return (
    <>
      <h1 className="text-2xl">{firstName ? `Welcome back, ${firstName}` : "My dashboard"}</h1>
      <p className="mt-1 text-sm text-muted-foreground">Your reservations, saved hostels and messages in one place.</p>

      <ul className="mt-6 grid gap-3 sm:grid-cols-2">
        {cards.map(({ href, icon: Icon, title, value, detail }) => (
          <li key={href}>
            <Link
              href={href}
              className="flex h-full items-start gap-3 rounded-xl border border-border bg-card p-4 transition-colors duration-150 hover:border-teal-600"
            >
              <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-teal-50 text-teal-700">
                <Icon aria-hidden className="size-5" />
              </span>
              <span className="min-w-0">
                <span className="block text-sm font-semibold text-muted-foreground">{title}</span>
                <span className="block font-display text-lg font-semibold text-foreground">{value}</span>
                <span className="block text-xs text-muted-foreground">{detail}</span>
              </span>
            </Link>
          </li>
        ))}
      </ul>

      <Link
        href="/search"
        className="mt-6 inline-flex h-10 items-center gap-2 rounded-md bg-primary px-4 text-sm font-semibold text-primary-foreground shadow-xs transition-colors duration-150 hover:bg-teal-700"
      >
        <Search aria-hidden className="size-4" />
        Find housing near campus
      </Link>
    </>
  );
}
