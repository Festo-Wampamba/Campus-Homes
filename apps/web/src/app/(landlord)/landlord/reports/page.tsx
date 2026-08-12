import type { Metadata } from "next";
import { BedDouble, Building2, CalendarCheck, Percent, Wallet } from "lucide-react";

import { getLandlordReservations, getMyProperties, getPropertyDetail } from "@/lib/landlord";
import { formatUgx } from "@/lib/format";
import {
  bookingOutcomes,
  bookingsTrend,
  campusDistribution,
  flattenRooms,
  propertyOccupancy,
  rentValueTrend,
  roomCategoryMix,
  roomStatusBreakdown,
} from "@/lib/landlord-analytics";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { StatCard } from "@/components/landlord/analytics/stat-card";
import { BookingsTrendChart } from "@/components/landlord/analytics/bookings-trend-chart";
import { RoomStatusChart } from "@/components/landlord/analytics/room-status-chart";
import { PropertyOccupancyChart } from "@/components/landlord/analytics/property-occupancy-chart";
import { RoomCategoryChart } from "@/components/landlord/analytics/room-category-chart";
import { RentValueChart } from "@/components/landlord/analytics/rent-value-chart";
import { CampusChart } from "@/components/landlord/analytics/campus-chart";
import { BookingOutcomesChart } from "@/components/landlord/analytics/booking-outcomes-chart";

export const metadata: Metadata = { title: "Reports & Analytics" };

export default async function LandlordReportsPage() {
  const [properties, reservations] = await Promise.all([getMyProperties(), getLandlordReservations()]);
  const details = await Promise.all(properties.map((p) => getPropertyDetail(p.id)));
  const rooms = flattenRooms(details);

  const totalRooms = rooms.length;
  const occupiedRooms = rooms.filter((r) => r.reservationStatus === "fulfilled").length;
  const occupancyRate = totalRooms > 0 ? Math.round((occupiedRooms / totalRooms) * 100) : null;
  const activeBookings = reservations.filter(
    (r) => r.status === "held" || r.status === "payment_pending",
  ).length;

  const statusData = roomStatusBreakdown(rooms);
  const occupancyByProperty = propertyOccupancy(details);
  const categoryMix = roomCategoryMix(rooms);
  const trend = bookingsTrend(reservations);
  const rentTrend = rentValueTrend(reservations, rooms);
  const totalRentValueUgx = rentTrend.reduce((sum, m) => sum + m.rentValueUgx, 0);
  const campusMix = campusDistribution(properties);
  const outcomes = bookingOutcomes(reservations);

  return (
    <>
      <h1 className="text-2xl">Reports & Analytics</h1>
      <p className="mt-1 text-sm text-muted-foreground">A live snapshot of how your properties are doing.</p>

      <div className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-4">
        <StatCard label="Properties" value={String(properties.length)} icon={Building2} tone="teal" />
        <StatCard label="Total rooms" value={String(totalRooms)} icon={BedDouble} tone="teal" />
        <StatCard
          label="Occupancy rate"
          value={occupancyRate === null ? "—" : `${occupancyRate}%`}
          detail={totalRooms > 0 ? `${occupiedRooms} of ${totalRooms} occupied` : undefined}
          icon={Percent}
          tone="coral"
        />
        <StatCard label="Active bookings" value={String(activeBookings)} icon={CalendarCheck} tone="teal" />
      </div>

      <div className="mt-4">
        <StatCard
          label="Rent value, last 12 months"
          value={formatUgx(totalRentValueUgx)}
          detail="Collected by you directly — not a CampusHomes payment"
          icon={Wallet}
          tone="coral"
        />
      </div>

      <div className="mt-6 grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Rent value by month</CardTitle>
            <CardDescription>Listed rent from confirmed move-ins, last 12 months.</CardDescription>
          </CardHeader>
          <RentValueChart data={rentTrend} />
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Bookings, last 8 weeks</CardTitle>
            <CardDescription>New reservations placed on your units, by week.</CardDescription>
          </CardHeader>
          <BookingsTrendChart data={trend} />
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Room status</CardTitle>
            <CardDescription>Every room across your properties, right now.</CardDescription>
          </CardHeader>
          <RoomStatusChart data={statusData} />
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Occupancy by property</CardTitle>
            <CardDescription>Share of rooms currently occupied, per property.</CardDescription>
          </CardHeader>
          <PropertyOccupancyChart data={occupancyByProperty} />
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Room category mix</CardTitle>
            <CardDescription>How your rooms split by type, with average listed price.</CardDescription>
          </CardHeader>
          <RoomCategoryChart data={categoryMix} />
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Properties by campus</CardTitle>
            <CardDescription>Where your portfolio reaches across the 4 launch catchments.</CardDescription>
          </CardHeader>
          <CampusChart data={campusMix} />
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Booking outcomes, all time</CardTitle>
            <CardDescription>Every reservation ever placed on your units, by final status.</CardDescription>
          </CardHeader>
          <BookingOutcomesChart data={outcomes} />
        </Card>
      </div>
    </>
  );
}
