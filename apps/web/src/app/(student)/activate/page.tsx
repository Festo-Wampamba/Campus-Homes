import type { Metadata } from "next";

import { Card, CardContent } from "@/components/ui/card";
import { ActivateForm } from "./activate-form";

export const metadata: Metadata = { title: "Link your booking", robots: { index: false } };

// A resident the landlord recorded before they had an account links that
// booking to this account with the landlord's single-use code. The (student)
// layout has already required a signed-in student.
export default async function ActivatePage({ searchParams }: { searchParams: Promise<{ code?: string | string[] }> }) {
  const raw = (await searchParams).code;
  const code = typeof raw === "string" ? raw.slice(0, 20) : "";
  return (
    <div className="max-w-xl">
      <p className="text-xs font-bold uppercase tracking-[0.16em] text-[#ae5528] dark:text-orange-300">Your room</p>
      <h1 className="ch-student-page__title mt-3">Link your booking</h1>
      <p className="ch-student-page__lede">
        Already living at a hostel, or booked with the landlord directly? Enter your portal code to see that booking, your receipts and your balance here.
      </p>
      <Card className="mt-7 w-full rounded-[18px] border-[#dbe7e5] shadow-[0_8px_24px_rgba(23,63,67,0.04)]">
        <CardContent className="p-6 sm:p-8">
          <ActivateForm initialCode={code} />
        </CardContent>
      </Card>
      <p className="mt-4 text-sm text-muted-foreground">
        Linking does not change your room, what you have paid, or whether you have moved in. No code? Ask your landlord to invite you from their Tenants page.
      </p>
    </div>
  );
}
