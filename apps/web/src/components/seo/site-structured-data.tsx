import { SUPPORT_FAQS } from "@campushomes/shared";

import { listingPhotoUrl } from "@/lib/cloudinary";
import { apiServerPublic } from "@/lib/server-api";
import { getSiteUrl } from "@/lib/site-url";

// The ways people type the brand, common misspellings included. alternateName
// is how search engines and AI answer engines learn that "campus homes",
// "campushomes" and "campass homes" all mean this site.
export const BRAND_ALTERNATE_NAMES = [
  "Campus Homes",
  "Campushomes",
  "Campus Home",
  "CampusHome",
  "CampusHomes Uganda",
  "Campus Homes Uganda",
  "Campus Homes Kampala",
  "Campus Homes Makerere",
  "Campass Homes",
  "Kampus Homes",
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
  return <JsonLd data={{ "@context": "https://schema.org", "@graph": graph }} />;
}

function JsonLd({ data }: { data: unknown }) {
  // Escape "<" so a value can never close the script tag early.
  const json = JSON.stringify(data).replace(/</g, "\\u003c");
  return <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: json }} />;
}

type ListingSeo = {
  id: string;
  name: string;
  streetAddress: string | null;
  lat: number | null;
  lon: number | null;
  minPriceUgx: number;
  maxPriceUgx: number;
  photoKeys: string[];
  amenities: string[];
};

/** One listing as a schema.org Hostel, so search results and AI answers can
 * quote its name, place, price range and amenities with a link back here. */
export async function ListingStructuredData({ listing }: { listing: ListingSeo }) {
  const base = await getSiteUrl();
  const price = (ugx: number) => ugx.toLocaleString("en-UG");
  const priceRange =
    listing.minPriceUgx === listing.maxPriceUgx
      ? `UGX ${price(listing.minPriceUgx)} per bed per semester`
      : `UGX ${price(listing.minPriceUgx)} to ${price(listing.maxPriceUgx)} per bed per semester`;
  return (
    <JsonLd
      data={{
        "@context": "https://schema.org",
        "@type": "Hostel",
        "@id": `${base}/listings/${listing.id}#hostel`,
        name: listing.name,
        url: `${base}/listings/${listing.id}`,
        description: `Student hostel near Makerere University, inspected in person by CampusHomes. Reserving a room is free.`,
        image: listing.photoKeys.slice(0, 6).map((key) => listingPhotoUrl(key, 1200)).filter(Boolean),
        priceRange,
        currenciesAccepted: "UGX",
        address: {
          "@type": "PostalAddress",
          ...(listing.streetAddress ? { streetAddress: listing.streetAddress } : {}),
          addressLocality: "Kampala",
          addressCountry: "UG",
        },
        ...(listing.lat !== null && listing.lon !== null
          ? { geo: { "@type": "GeoCoordinates", latitude: listing.lat, longitude: listing.lon } }
          : {}),
        amenityFeature: listing.amenities.map((name) => ({ "@type": "LocationFeatureSpecification", name, value: true })),
        provider: { "@id": `${base}/#organization` },
      }}
    />
  );
}
