import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, CalendarCheck, ChevronRight, Heart, MessageCircle, Search, UserRound } from "lucide-react";

import { MAX_ACTIVE_RESERVATIONS } from "@campushomes/shared";

import { StatusChip } from "@/components/status-chip";
import { bookingStage, isBooking } from "@/lib/booking-progress";
import { formatDateTime, roomCategoryLabel } from "@/lib/format";
import { getSavedListings } from "@/lib/saved-listings";
import { getMyReservations } from "@/lib/reservations";
import { getServerSession } from "@/lib/session";

export const metadata: Metadata = { title: "My dashboard" };

const STAGE_ORDER: Record<string, number> = { reserved: 0, booked: 1, occupied: 2 };

export default async function StudentDashboardPage() {
  const [session, reservations, saved] = await Promise.all([getServerSession(), getMyReservations(), getSavedListings()]);
  const live = reservations.filter((r) => r.status === "reserved" || r.status === "booked");
  const nextHoldEnd = live.filter(row => row.status === "reserved").map((r) => r.reservedExpiresAt).filter((at): at is string => Boolean(at)).sort()[0];
  const firstName = session?.user.name?.trim().split(/\s+/)[0];
  const bookings = reservations.filter(isBooking).sort((a, b) => (STAGE_ORDER[a.status] ?? 3) - (STAGE_ORDER[b.status] ?? 3));
  const cards = [
    { href: "/reservations", icon: CalendarCheck, title: "My reservations", value: `${live.length} of ${MAX_ACTIVE_RESERVATIONS} active`, detail: nextHoldEnd ? `Next hold ends ${formatDateTime(nextHoldEnd)}` : "No rooms on hold" },
    { href: "/saved", icon: Heart, title: "Favourites", value: `${saved.length} saved`, detail: "Hostels you saved to compare" },
    { href: "/messages", icon: MessageCircle, title: "Messages", value: "Chat with landlords", detail: "About rooms you reserved" },
    { href: "/profile", icon: UserRound, title: "Profile", value: "Your details", detail: "Name, phone and university" },
  ];

  return (
    <>
      <header>
        <p className="text-xs font-bold uppercase tracking-[0.16em] text-[#ae5528] dark:text-orange-300">Student workspace</p>
        <h1 className="ch-student-page__title mt-3">{firstName ? `Welcome back, ${firstName}` : "Your housing journey"}</h1>
        <p className="ch-student-page__lede">Keep your reservations, saved hostels and landlord conversations in one place.</p>
      </header>

      <div className="ch-student-next-steps">
        <div className="ch-student-next-steps__primary">
          <p className="text-xs font-bold uppercase tracking-[0.14em] text-teal-800">Next step</p>
          <h2 className="mt-3 text-2xl tracking-[-0.04em] text-teal-950">{live.length ? "Continue your housing journey." : "Find a room that fits your semester."}</h2>
          <p className="mt-2 max-w-lg text-sm leading-6 text-teal-950/70">{live.length ? `You have ${live.length} active reservation${live.length === 1 ? "" : "s"}. Review the expiry, contact your landlord and follow your next booking step.` : "Start with inspected hostels around Makerere, compare the room facts and reserve when you are ready."}</p>
          <Link href={live.length ? "/reservations" : "/search?campus=MUK"} className="mt-5 inline-flex min-h-11 items-center gap-2 rounded-full bg-teal-900 px-5 text-sm font-bold text-white hover:bg-teal-700">{live.length ? "View reservations and next steps" : "Find housing"} <ArrowRight aria-hidden className="size-4" /></Link>
        </div>
        <div className="ch-student-next-steps__secondary">
          <p className="text-xs font-bold uppercase tracking-[0.14em] text-white/65">Your live activity</p>
          <p className="mt-3 text-3xl font-semibold text-white">{live.length}</p>
          <p className="mt-1 text-sm text-white/70">active reservation{live.length === 1 ? "" : "s"}</p>
          <Link href="/reservations" className="mt-5 inline-flex min-h-11 items-center gap-2 font-bold text-white underline-offset-4 hover:underline">Open reservations <ArrowRight aria-hidden className="size-4" /></Link>
        </div>
      </div>

      <ul className="ch-student-stat-grid" aria-label="Student account summary">
        {cards.map(({ href, icon: Icon, title, value, detail }) => (
          <li key={href}>
            <Link href={href} className="ch-student-stat">
              <span className="ch-student-stat__icon"><Icon aria-hidden className="size-5" /></span>
              <span><span className="block text-xs font-bold uppercase tracking-[0.1em] text-[var(--ch-ink-soft)]">{title}</span><span className="mt-1 block text-base font-bold text-[var(--ch-ink)]">{value}</span><span className="mt-1 block text-xs leading-5 text-[var(--ch-ink-soft)]">{detail}</span></span>
            </Link>
          </li>
        ))}
      </ul>

      <section aria-labelledby="my-bookings-heading" className="ch-student-section">
        <div className="ch-student-section__header"><div><p className="text-xs font-bold uppercase tracking-[0.14em] text-[#ae5528] dark:text-orange-300">Stay on top of your move</p><h2 id="my-bookings-heading" className="ch-student-section__title mt-2">My bookings</h2></div><Link href="/reservations" className="inline-flex min-h-11 items-center gap-2 text-sm font-bold text-teal-700 hover:underline">View all <ArrowRight aria-hidden className="size-4" /></Link></div>
        {bookings.length === 0 ? (
          <div className="ch-student-card mt-4 p-6"><p className="text-sm leading-6 text-[var(--ch-ink-soft)]">No booking requests yet. Reserve a room, agree terms with the landlord, then tap Request booking in My reservations to follow it here.</p></div>
        ) : (
          <ul className="ch-student-table-list">
            {bookings.map((booking) => {
              const stage = bookingStage(booking);
              return <li key={booking.id} className="ch-student-card px-5"><Link href={`/reservations?track=${booking.id}`} className="ch-student-table-row"><span className="min-w-0"><span className="block truncate font-bold text-[var(--ch-ink)]">{booking.propertyName}</span><span className="mt-1 block text-xs text-[var(--ch-ink-soft)]">{roomCategoryLabel(booking.roomCategory)} ({booking.bedLabel}) · Ref {booking.id.slice(0, 8).toUpperCase()}</span></span><span className="flex shrink-0 items-center gap-2"><StatusChip tone={stage.tone}>{stage.label}</StatusChip><ChevronRight aria-hidden className="size-4 text-[var(--ch-ink-soft)]" /></span></Link></li>;
            })}
          </ul>
        )}
      </section>

      <Link href="/search?campus=MUK" className="mt-8 inline-flex min-h-11 items-center gap-2 rounded-full bg-teal-900 px-5 text-sm font-bold text-white hover:bg-teal-700"><Search aria-hidden className="size-4" /> Find housing near campus</Link>
    </>
  );
}
