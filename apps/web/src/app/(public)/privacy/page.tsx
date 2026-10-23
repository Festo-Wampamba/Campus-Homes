import type { Metadata } from "next";

import { LegalPage } from "@/components/legal-page";
import { privacyPolicy } from "@/content/legal-documents";

export const metadata: Metadata = {
  title: "Privacy policy review draft",
  description: "Review the CampusHomes privacy policy draft issued by Akolet, including personal data, AI support, your rights and Ugandan privacy requirements.",
  alternates: { canonical: "/privacy" },
  robots: { index: false, follow: true },
};

export default function Page() {
  return <LegalPage document={privacyPolicy} />;
}
