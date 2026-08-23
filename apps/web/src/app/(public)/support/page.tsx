import type { Metadata } from "next";
import { Mail, Phone, ShieldAlert } from "lucide-react";

import { api } from "@/lib/api";

export const metadata: Metadata = { title: "Support" };

export default async function SupportPage() {
  const support = await api<{ email: string; phone: string }>("/listings/support-contact").catch(
    () => ({ email: "hello@campushomes.ug", phone: "" }),
  );

  return (
    <div className="mx-auto w-full max-w-2xl space-y-6 px-4 py-16 sm:px-6 lg:px-8">
      <h1 className="text-2xl">Support</h1>
      <p className="text-sm text-muted-foreground">
        Questions about a listing, a reservation, or something that doesn&apos;t
        look right — reach the CampusHomes team directly.
      </p>

      <div className="space-y-3 rounded-xl border border-border bg-card p-5">
        <a
          href={`mailto:${support.email}`}
          className="flex items-center gap-3 text-sm font-semibold hover:underline"
        >
          <Mail aria-hidden className="size-4 text-muted-foreground" />
          {support.email}
        </a>
        {support.phone && (
          <a
            href={`tel:${support.phone}`}
            className="flex items-center gap-3 text-sm font-semibold hover:underline"
          >
            <Phone aria-hidden className="size-4 text-muted-foreground" />
            {support.phone}
          </a>
        )}
      </div>

      <div className="flex gap-3 rounded-xl border border-border bg-card p-5">
        <ShieldAlert aria-hidden className="size-5 shrink-0 text-destructive" />
        <div className="space-y-1 text-sm">
          <p className="font-semibold">Report a safety concern or inaccurate listing</p>
          <p className="text-muted-foreground">
            If a property doesn&apos;t match what was verified, or you have a
            safety concern about a landlord or a room, email us with the
            property name and reservation ID (if any) — our Ops team
            investigates every report.
          </p>
        </div>
      </div>
    </div>
  );
}
