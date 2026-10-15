import { SUPPORT_FAQS } from "@campushomes/shared";

import { apiServerPublic } from "@/lib/server-api";
import { getSiteUrl } from "@/lib/site-url";

// The ways people type the brand. alternateName is how search engines and AI
// answer engines learn that "campus homes" and "campushomes" mean this site.
export const BRAND_ALTERNATE_NAMES = [
  "Campus Homes",
  "Campushomes",
  "Campus Home",
  "CampusHome",
  "CampusHomes Uganda",
  "Campus Homes Uganda",
];

const ORGANIZATION_DESCRIPTION =
  "CampusHomes (also written Campus Homes) lists student hostels near Makerere University in Kampala, Uganda. A CampusHomes inspector visits every hostel in person before it is listed; students compare rooms, prices and amenities and reserve a room for free.";

/** Organization + WebSite (with sitelinks search box) + FAQPage, as one JSON-LD graph for the homepage. */
export async function SiteStructuredData() {
  const [base, support] = await Promise.all([
    getSiteUrl(),
    apiServerPublic<{ email: string; phone: string }>("/listings/support-contact"),
  ]);
  const email = support?.email || "hello@campushomes.co.ug";
  const graph = [
    {
      "@type": "Organization",
      "@id": `${base}/#organization`,
      name: "CampusHomes",
      alternateName: BRAND_ALTERNATE_NAMES,
      url: base,
      logo: `${base}/images/branding/campushomes-mark.png`,
      description: ORGANIZATION_DESCRIPTION,
      email,
      areaServed: { "@type": "Country", name: "Uganda" },
      address: { "@type": "PostalAddress", addressLocality: "Kampala", addressCountry: "UG" },
      contactPoint: {
        "@type": "ContactPoint",
        contactType: "customer support",
        email,
        ...(support?.phone ? { telephone: support.phone } : {}),
        areaServed: "UG",
        availableLanguage: "en",
      },
    },
    {
      "@type": "WebSite",
      "@id": `${base}/#website`,
      name: "CampusHomes",
      alternateName: BRAND_ALTERNATE_NAMES,
      url: base,
      inLanguage: "en-UG",
      publisher: { "@id": `${base}/#organization` },
      potentialAction: {
        "@type": "SearchAction",
        target: { "@type": "EntryPoint", urlTemplate: `${base}/search?q={search_term_string}` },
        "query-input": "required name=search_term_string",
      },
    },
    {
      "@type": "FAQPage",
      "@id": `${base}/#faq`,
      mainEntity: SUPPORT_FAQS.map((faq) => ({
        "@type": "Question",
        name: faq.question,
        acceptedAnswer: { "@type": "Answer", text: faq.answer },
      })),
    },
  ];
  // Escape "<" so a value can never close the script tag early.
  const json = JSON.stringify({ "@context": "https://schema.org", "@graph": graph }).replace(/</g, "\\u003c");
  return <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: json }} />;
}
