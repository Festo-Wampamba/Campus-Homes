import type { Metadata } from "next";

import { LegalPage } from "@/components/legal-page";
import { landlordAgreement } from "@/content/landlord-agreement";

export const metadata: Metadata = {
  title: "Landlord agreement draft",
  description: "Read the CampusHomes landlord agreement draft issued by Akolet: listing standards, verification, bookings, fees and ending the agreement.",
  alternates: { canonical: "/landlord-agreement" },
  robots: { index: false, follow: true },
};

export default function Page() {
  return <LegalPage document={landlordAgreement} />;
}
