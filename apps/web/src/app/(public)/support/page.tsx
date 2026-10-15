import type { Metadata } from "next";

import { getServerSession } from "@/lib/session";
import { apiServerPublic, apiServerStrict } from "@/lib/server-api";
import { getMyReservations } from "@/lib/reservations";

import type { Inquiry } from "@campushomes/shared";

import { SupportDesk } from "@/components/support/support-desk";
import { SupportTabs, type SupportTab } from "@/components/support/support-tabs";

export const metadata: Metadata = {
  title: "Support",
  description:
    "Ask CampusHomes AI, chat with the CampusHomes team on WhatsApp, or read the user manual on finding, reserving and booking a room.",
  alternates: { canonical: "/support" },
};

export default async function SupportPage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const { tab } = await searchParams;
  const initialTab: SupportTab = tab === "contact" || tab === "manual" ? tab : "ai";
  const session = await getServerSession();
  const isStudent = session?.user.status === "active" && session.access.workspaces.includes("student");

  // Signed-in students get the inquiry desk (form + their threads) in the
  // Contact tab; everyone else is offered sign-in there instead.
  const [support, inquiries, reservations] = await Promise.all([
    apiServerPublic<{ email: string; phone: string }>("/listings/support-contact"),
    isStudent ? apiServerStrict<Inquiry[]>("/inquiries/mine").catch(() => []) : Promise.resolve([]),
    isStudent ? getMyReservations() : Promise.resolve([]),
  ]);

  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-12 sm:px-6 lg:px-8 lg:py-16">
      <SupportTabs
        initialTab={initialTab}
        email={support?.email || "hello@campushomes.co.ug"}
        phone={support?.phone ?? ""}
        desk={isStudent ? <SupportDesk initialInquiries={inquiries} reservations={reservations} /> : null}
      />
    </div>
  );
}
