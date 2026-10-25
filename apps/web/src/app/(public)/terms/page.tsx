import type { Metadata } from "next";

import { LegalPage } from "@/components/legal-page";
import { termsAndConditions } from "@/content/legal-documents";

export const metadata: Metadata = {
  title: "Terms and conditions review draft",
  description: "Review the CampusHomes terms draft issued by Akolet, covering free reservations, booking, landlord responsibilities and statutory rights in Uganda.",
  alternates: { canonical: "/terms" },
  robots: { index: false, follow: true },
};

export default function Page() {
  return <LegalPage document={termsAndConditions} />;
}
