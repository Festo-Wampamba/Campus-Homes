import type { Metadata } from "next";
import Link from "next/link";
import { CalendarCheck, ChevronRight, Heart, MessageCircle, Search, User } from "lucide-react";

import { MAX_ACTIVE_RESERVATIONS } from "@campushomes/shared";

import { StatusChip } from "@/components/status-chip";
import { bookingStage, isBooking } from "@/lib/booking-progress";
import { getMyReservations } from "@/lib/reservations";
import { getSavedListings } from "@/lib/saved-listings";
import { getServerSession } from "@/lib/session";
import { formatDateTime, roomCategoryLabel } from "@/lib/format";

export const metadata: Metadata = { title: "My dashboard" };

// In-progress bookings first, then completed, then ended ones.
const STAGE_ORDER: Record<string, number> = { reserved: 0, booked: 1, occupied: 2 };

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
  const bookings = reservations
    .filter(isBooking)
    .sort((a, b) => (STAGE_ORDER[a.status] ?? 3) - (STAGE_ORDER[b.status] ?? 3));

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

      <section aria-labelledby="my-bookings-heading" className="mt-8">
        <h2 id="my-bookings-heading" className="text-lg">My bookings</h2>
        {bookings.length === 0 ? (
          <p className="mt-2 text-sm text-muted-foreground">
            No booking requests yet. Reserve a room, agree terms with the landlord, then tap Request booking in My
            reservations to follow it here.
          </p>
        ) : (
          <ul className="mt-3 space-y-2">
            {bookings.map((booking) => {
              const stage = bookingStage(booking);
              return (
                <li key={booking.id}>
                  <Link
                    href={`/reservations?track=${booking.id}`}
                    className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-card p-4 transition-colors duration-150 hover:border-teal-600"
                  >
                    <span className="min-w-0">
                      <span className="block font-semibold text-foreground">{booking.propertyName}</span>
                      <span className="block text-xs text-muted-foreground">
                        {roomCategoryLabel(booking.roomCategory)} ({booking.bedLabel}) · Ref{" "}
                        {booking.id.slice(0, 8).toUpperCase()}
                      </span>
                    </span>
                    <span className="flex items-center gap-2">
                      <StatusChip tone={stage.tone}>{stage.label}</StatusChip>
                      <span className="sr-only">Track this booking</span>
                      <ChevronRight aria-hidden className="size-4 text-muted-foreground" />
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </section>

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
