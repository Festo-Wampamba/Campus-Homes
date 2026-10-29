import type { Metadata } from "next";

import { LegalPage } from "@/components/legal-page";
import { landlordAgreement } from "@/content/landlord-agreement";
import { getSupportEmail } from "@/lib/support-contact";

export const metadata: Metadata = {
  title: "Landlord agreement draft",
  description: "Read the CampusHomes landlord agreement draft issued by Akolet: listing standards, verification, bookings, fees and ending the agreement.",
  alternates: { canonical: "/landlord-agreement" },
  robots: { index: false, follow: true },
};

export default async function Page() {
  return <LegalPage document={landlordAgreement} supportEmail={await getSupportEmail()} />;
}
