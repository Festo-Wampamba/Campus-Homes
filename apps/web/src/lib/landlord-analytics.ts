import type { LandlordReservationView, Property, PropertyDetail } from "@campushomes/shared";

import { roomCategoryLabel } from "@/lib/format";
import type { BookingsTrendPoint } from "@/components/landlord/analytics/bookings-trend-chart";
import type { PropertyOccupancyRow } from "@/components/landlord/analytics/property-occupancy-chart";
import type { RoomCategoryRow } from "@/components/landlord/analytics/room-category-chart";
import type { RoomStatusSlice } from "@/components/landlord/analytics/room-status-chart";
import type { RentValuePoint } from "@/components/landlord/analytics/rent-value-chart";
import type { CampusSlice } from "@/components/landlord/analytics/campus-chart";
import type { BookingOutcomeRow } from "@/components/landlord/analytics/booking-outcomes-chart";

/** Every room across every property, flattened once so each chart doesn't
 * re-walk the property/detail nesting on its own. */
export function flattenRooms(details: (PropertyDetail | null)[]) {
  return details.flatMap((d) =>
    d ? d.rooms.map((room) => ({ ...room, propertyName: d.property.name })) : [],
  );
}

export function roomStatusBreakdown(rooms: ReturnType<typeof flattenRooms>): RoomStatusSlice[] {
  let available = 0;
  let inProgress = 0;
  let occupied = 0;
  for (const room of rooms) {
    if (room.reservationStatus === "fulfilled") occupied += 1;
    else if (room.reservationStatus === "held" || room.reservationStatus === "payment_pending") inProgress += 1;
    else if (room.reservationStatus === null) available += 1;
  }
  return [
    { name: "Available", value: available, color: "var(--color-muted-foreground)" },
    { name: "In progress", value: inProgress, color: "var(--color-warning)" },
    { name: "Occupied", value: occupied, color: "var(--color-teal-600)" },
  ];
}

export function propertyOccupancy(details: (PropertyDetail | null)[]): PropertyOccupancyRow[] {
  return details
    .filter((d): d is PropertyDetail => d !== null && d.rooms.length > 0)
    .map((d) => {
      const total = d.rooms.length;
      const occupied = d.rooms.filter((r) => r.reservationStatus === "fulfilled").length;
      return {
        name: d.property.name,
        occupied,
        total,
        occupancyRate: Math.round((occupied / total) * 100),
      };
    })
    .sort((a, b) => b.occupancyRate - a.occupancyRate);
}

export function roomCategoryMix(rooms: ReturnType<typeof flattenRooms>): RoomCategoryRow[] {
  const byCategory = new Map<string, { count: number; priceSum: number }>();
  for (const room of rooms) {
    const bucket = byCategory.get(room.roomCategory) ?? { count: 0, priceSum: 0 };
    bucket.count += 1;
    bucket.priceSum += room.pricePerTermUgx;
    byCategory.set(room.roomCategory, bucket);
  }
  return Array.from(byCategory.entries())
    .map(([category, { count, priceSum }]) => ({
      category: roomCategoryLabel(category),
      count,
      avgPriceUgx: Math.round(priceSum / count),
    }))
    .sort((a, b) => b.count - a.count);
}

// Real weeks derived from reservations.createdAt (a genuine DB column, not
// fabricated) — the last 8 calendar weeks, including weeks with zero
// bookings so the line doesn't silently skip gaps.
export function bookingsTrend(
  reservations: LandlordReservationView[],
  weeks = 8,
  now = new Date(),
): BookingsTrendPoint[] {
  const weekStart = (d: Date) => {
    const copy = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
    const day = copy.getUTCDay();
    copy.setUTCDate(copy.getUTCDate() - day);
    return copy;
  };

  const buckets: { start: Date; label: string; bookings: number }[] = [];
  const currentWeekStart = weekStart(now);
  for (let i = weeks - 1; i >= 0; i--) {
    const start = new Date(currentWeekStart);
    start.setUTCDate(start.getUTCDate() - i * 7);
    buckets.push({
      start,
      label: start.toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" }),
      bookings: 0,
    });
  }

  for (const r of reservations) {
    const created = weekStart(new Date(r.createdAt));
    const bucket = buckets.find((b) => b.start.getTime() === created.getTime());
    if (bucket) bucket.bookings += 1;
  }

  return buckets.map(({ label, bookings }) => ({ week: label, bookings }));
}

// Listed rent value, not a payment record — CampusHomes never sees rent
// (payments RLS keeps that table invisible to landlords entirely; only the
// 5,000 UGX platform hold fee ever touches it). This sums each fulfilled
// reservation's unit price by the month it was confirmed, i.e. money that
// changed hands directly between landlord and tenant, off-platform.
export function rentValueTrend(
  reservations: LandlordReservationView[],
  rooms: ReturnType<typeof flattenRooms>,
  months = 12,
  now = new Date(),
): RentValuePoint[] {
  const priceByUnit = new Map(rooms.map((r) => [r.id, r.pricePerTermUgx]));

  const monthStart = (d: Date) => new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1));
  const buckets: { start: Date; label: string; rentValueUgx: number }[] = [];
  const current = monthStart(now);
  for (let i = months - 1; i >= 0; i--) {
    const start = new Date(current);
    start.setUTCMonth(start.getUTCMonth() - i);
    buckets.push({
      start,
      label: start.toLocaleDateString("en-GB", { month: "short", year: "2-digit", timeZone: "UTC" }),
      rentValueUgx: 0,
    });
  }

  for (const r of reservations) {
    if (r.status !== "fulfilled") continue;
    const price = priceByUnit.get(r.unitId);
    if (price === undefined) continue;
    const created = monthStart(new Date(r.createdAt));
    const bucket = buckets.find((b) => b.start.getTime() === created.getTime());
    if (bucket) bucket.rentValueUgx += price;
  }

  return buckets.map(({ label, rentValueUgx }) => ({ month: label, rentValueUgx }));
}

// Real portfolio spread across the 4 launch catchments — landlord's own
// properties, not a platform-wide figure.
export function campusDistribution(properties: Property[]): CampusSlice[] {
  const counts = new Map<string, number>();
  for (const p of properties) {
    counts.set(p.catchment, (counts.get(p.catchment) ?? 0) + 1);
  }
  const palette = ["var(--color-teal-600)", "var(--color-coral-500)", "var(--color-teal-900)", "var(--color-warning)"];
  return Array.from(counts.entries()).map(([name, value], i) => ({
    name,
    value,
    color: palette[i % palette.length],
  }));
}

// Every reservation ever placed on the landlord's units, bucketed by its
// final status — the booking funnel, not just the live snapshot the room-
// status donut shows.
export function bookingOutcomes(reservations: LandlordReservationView[]): BookingOutcomeRow[] {
  const labels: Record<string, string> = {
    fulfilled: "Fulfilled",
    cancelled: "Cancelled",
    expired: "Expired",
    refunded: "Refunded",
    held: "Held",
    payment_pending: "Payment pending",
    payment_failed: "Payment failed",
  };
  const counts = new Map<string, number>();
  for (const r of reservations) {
    counts.set(r.status, (counts.get(r.status) ?? 0) + 1);
  }
  return Array.from(counts.entries())
    .map(([status, count]) => ({ outcome: labels[status] ?? status, count }))
    .sort((a, b) => b.count - a.count);
}
