import { Suspense, type ComponentType } from "react";
import { getServerSession } from "@/lib/session";
import { getSavedListings } from "@/lib/saved-listings";
import Image from "next/image";
import Link from "next/link";
import {
  ArrowRightIcon,
  CheckCircledIcon,
  LockClosedIcon,
  MagnifyingGlassIcon,
  SewingPinIcon,
  StarFilledIcon,
} from "@radix-ui/react-icons";
import {
  listingSearchPageResponseSchema,
  testimonialSchema,
  type ListingSearchPageResponse,
  type ListingSearchResult,
  type Testimonial,
} from "@campushomes/shared";

import { DiscoverySearch } from "@/components/discovery-search";
import { HostelCard } from "@/components/hostel-card";
import { SiteStructuredData } from "@/components/seo/site-structured-data";
import { api } from "@/lib/api";
import { ENABLED_CAMPUSES, UGANDA_BOUNDS } from "@/lib/campuses";

type MarketingIcon = ComponentType<{ className?: string }>;

const TRUST_POINTS: { title: string; body: string; icon: MarketingIcon }[] = [
  {
    title: "Inspected in person",
    body: "Our team visits each hostel and records what was actually there.",
    icon: CheckCircledIcon,
  },
  {
    title: "Photos from the visit",
    body: "See rooms and shared spaces before you spend time travelling to view.",
    icon: MagnifyingGlassIcon,
  },
  {
    title: "Reserve for free",
    body: "Hold an available bed while you view the room and agree terms directly.",
    icon: LockClosedIcon,
  },
];

const HOW_IT_WORKS = [
  {
    number: "01",
    title: "Search around Makerere",
    body: "Start with your campus or an area such as Kikoni, Wandegeya or Makerere.",
  },
  {
    number: "02",
    title: "Compare real room details",
    body: "Check the inspection status, room capacity, bathroom arrangement, availability and semester price.",
  },
  {
    number: "03",
    title: "Reserve when it feels right",
    body: "Reserve a bed for free, view the room and agree the tenancy terms with the landlord.",
  },
] as const;

type FeaturedListings = {
  items: ListingSearchResult[];
  total: number;
  failed: boolean;
};

type AreaSummary = {
  name: string;
  query: string;
  total: number | null;
};

function searchPageParams(university: string, extra: Record<string, string> = {}) {
  return new URLSearchParams({
    ...Object.fromEntries(Object.entries(UGANDA_BOUNDS).map(([key, value]) => [key, String(value)])),
    university,
    page: "1",
    limit: "6",
    ...extra,
  });
}

async function getFeaturedListings(university: string): Promise<FeaturedListings> {
  try {
    const response: ListingSearchPageResponse = listingSearchPageResponseSchema.parse(
      await api<unknown>(`/listings/search-page?${searchPageParams(university)}`, { cache: "no-store" }),
    );
    return { items: response.items, total: response.total, failed: false };
  } catch {
    return { items: [], total: 0, failed: true };
  }
}

async function getAreaSummaries(university: string, areas: readonly { name: string; query: string }[]): Promise<AreaSummary[]> {
  return Promise.all(
    areas.map(async (area) => {
      try {
        const response = listingSearchPageResponseSchema.parse(
          await api<unknown>(
            `/listings/search-page?${searchPageParams(university, { q: area.query, limit: "1" })}`,
            { cache: "no-store" },
          ),
        );
        return { ...area, total: response.total };
      } catch {
        return { ...area, total: null };
      }
    }),
  );
}

async function getTestimonials(): Promise<Testimonial[]> {
  try {
    return testimonialSchema.array().parse(await api<unknown>("/listings/reviews", { cache: "no-store" }));
  } catch {
    return [];
  }
}

export default function HomePage() {
  const campus = ENABLED_CAMPUSES.find((item) => item.code === "MUK") ?? ENABLED_CAMPUSES[0];
  if (!campus) throw new Error("Makerere campus is not configured");
  return (
    <>
      <SiteStructuredData />

      <section className="ch-home-hero" aria-labelledby="home-heading">
        <div className="ch-home-hero__media">
          <Image
            src="/images/campushomes/hero-hostel-hd-v2.webp"
            alt=""
            fill
            priority
            sizes="100vw"
            className="object-cover object-center"
          />
        </div>
        <div className="ch-home-hero__scrim" />
        <div className="ch-home-hero__inner">
          <div className="ch-home-hero__copy">
            <p className="mb-5 text-xs font-bold uppercase tracking-[0.16em] text-white/80 sm:text-sm">
              Student hostels near Makerere University
            </p>
            <h1 id="home-heading" className="ch-home-hero__title">
              Find your hostel near Makerere
            </h1>
            <p className="ch-home-hero__subcopy">
              Compare inspected hostels, see semester prices and reserve your room for free.
            </p>
            <div className="ch-discovery-search">
              <DiscoverySearch hero />
            </div>
          </div>
        </div>
      </section>

      <section className="ch-trust-strip" aria-label="Why students use CampusHomes">
        <div className="ch-trust-strip__inner">
          {TRUST_POINTS.map(({ title, body, icon: Icon }) => (
            <div key={title} className="ch-trust-strip__item">
              <span className="ch-trust-strip__icon"><Icon aria-hidden className="size-5" /></span>
              <span>
                <strong className="block text-sm">{title}</strong>
                <span className="mt-1 block text-sm leading-5 text-[var(--ch-ink-soft)]">{body}</span>
              </span>
            </div>
          ))}
        </div>
      </section>

      <Suspense fallback={<section className="ch-section" aria-label="Loading hostel discovery"><p role="status" className="text-muted-foreground">Loading hostel discovery…</p></section>}>
        <HomeDiscovery />
      </Suspense>
    </>
  );
}

async function HomeDiscovery() {
  const campus = ENABLED_CAMPUSES[0];
  const session = await getServerSession();
  const canSave = !!(session?.user.status === "active" && session.access.workspaces.includes("student"));
  const [featured, testimonials, areas, saved] = await Promise.all([
    getFeaturedListings(campus.code), getTestimonials(), getAreaSummaries(campus.code, campus.areas),
    canSave ? getSavedListings() : [],
  ]);
  return <>
      <section className="ch-section ch-section--soft" aria-labelledby="campus-heading">
        <div className="ch-section__header">
          <div>
            <p className="ch-eyebrow">Browse by campus</p>
            <h2 id="campus-heading" className="ch-section__title">Stay close to Makerere.</h2>
            <p className="ch-section__lede">Choose the campus context first, then narrow your search by the neighbourhood you actually want to live in.</p>
          </div>
          <Link href={`/search?campus=${campus.code}`} className="inline-flex min-h-11 shrink-0 items-center gap-2 font-bold text-teal-700 underline-offset-4 hover:underline">
            Browse Makerere <ArrowRightIcon aria-hidden />
          </Link>
        </div>
        <div className="ch-campus-grid">
          <Link href={`/search?campus=${campus.code}`} className="ch-campus-card">
            <Image src={campus.image} alt={`Student housing around ${campus.name}`} fill sizes="(min-width: 760px) 60vw, 100vw" className="ch-campus-card__image object-cover" />
            <span className="ch-campus-card__scrim" />
            <span className="ch-campus-card__content">
              <span className="text-xs font-bold uppercase tracking-[0.16em] text-white/80">{campus.code}</span>
              <h3><span className="sr-only">Browse </span>{campus.name}</h3>
              <span className="mt-2 block text-sm text-white/80">{campus.areas.map((area) => area.name).join(" · ")}</span>
            </span>
          </Link>
          <div className="flex flex-col justify-between rounded-[26px] bg-card p-7 sm:p-9">
            <div>
              <p className="ch-eyebrow">University discovery</p>
              <h3 className="mt-2 max-w-sm text-2xl tracking-[-0.04em]">Start with the campus you attend.</h3>
            </div>
            <p className="mt-5 max-w-sm text-sm leading-6 text-[var(--ch-ink-soft)]">We’re starting around Makerere. Compare inspected hostels and choose the area that works for you.</p>
            <Link href={`/search?campus=${campus.code}`} className="mt-7 inline-flex min-h-11 items-center gap-2 self-start font-bold text-teal-700 underline-offset-4 hover:underline">
              Browse Makerere hostels <ArrowRightIcon aria-hidden />
            </Link>
          </div>
        </div>
      </section>

      <section className="ch-section" aria-labelledby="featured-heading">
        <div className="ch-section__header">
          <div>
            <p className="ch-eyebrow">Start with inspected supply</p>
            <h2 id="featured-heading" className="ch-section__title">Hostels students can compare today</h2>
            <p className="ch-section__lede">
              Compare room arrangements, availability and semester prices at inspected hostels near campus.
            </p>
          </div>
          <Link href={`/search?campus=${campus.code}`} className="inline-flex min-h-11 shrink-0 items-center gap-2 font-bold text-teal-700 underline-offset-4 hover:underline">
            See all hostels <ArrowRightIcon aria-hidden />
          </Link>
        </div>

        {featured.items.length ? (
          <ul className="ch-home-listings">
            {featured.items.slice(0, 6).map((listing) => (
              <li key={listing.id}><HostelCard listing={listing} layout="vertical" canSave={canSave} saved={saved.some(row => row.id === listing.id)} /></li>
            ))}
          </ul>
        ) : (
          <div className="ch-home-listings__empty">
            <p className="ch-eyebrow">Makerere hostels</p>
            <h3 className="mt-2 text-xl">{featured.failed ? "Hostel listings are temporarily unavailable." : "New inspections are being prepared."}</h3>
            <p className="mt-2 max-w-xl text-sm leading-6 text-[var(--ch-ink-soft)]">
              {featured.failed
                ? "We could not load the live listings right now. Search again in a moment to see the latest published hostels."
                : "There are no available inspected hostels around Makerere right now. Check back after the next inspection visit."}
            </p>
            <Link href={`/search?campus=${campus.code}`} className="mt-5 inline-flex min-h-11 items-center gap-2 rounded-full bg-teal-900 px-5 text-sm font-bold text-white hover:bg-teal-700">
              Search Makerere hostels <ArrowRightIcon aria-hidden />
            </Link>
          </div>
        )}
      </section>

      <section className="ch-section ch-section--soft" aria-labelledby="area-heading">
        <div className="ch-section__header">
          <div>
            <p className="ch-eyebrow">Areas around campus</p>
            <h2 id="area-heading" className="ch-section__title">Search by the place you know.</h2>
            <p className="ch-section__lede">Open an area to see the live count for that search and compare the hostels currently published there.</p>
          </div>
        </div>
        <div className="ch-area-list">
          {areas.map((area) => (
            <Link key={area.query} href={`/search?campus=${campus.code}&q=${encodeURIComponent(area.query)}`} className="ch-area-link">
              <span>
                <span className="block text-base font-bold">{area.name}</span>
                <span className="mt-1 block text-xs text-[var(--ch-ink-soft)]">
                  {area.total == null ? "Browse nearby hostels" : `${area.total} ${area.total === 1 ? "hostel" : "hostels"} listed`}
                </span>
              </span>
              <SewingPinIcon aria-hidden className="size-5 shrink-0 text-teal-700" />
            </Link>
          ))}
        </div>
      </section>

      <section id="how-it-works" className="ch-section" aria-labelledby="how-heading">
        <p className="ch-eyebrow">A calmer way to find a room</p>
        <h2 id="how-heading" className="ch-section__title">From search to <span className="whitespace-nowrap">move-in</span>, with the next step clear.</h2>
        <ol className="ch-steps">
          {HOW_IT_WORKS.map((step) => (
            <li key={step.number} className="ch-step">
              <span className="ch-step__number">{step.number}</span>
              <h3>{step.title}</h3>
              <p>{step.body}</p>
            </li>
          ))}
        </ol>
        <Link href="/how-it-works" className="mt-8 inline-flex min-h-12 items-center gap-2 rounded-full border border-current px-6 font-bold text-[var(--ch-accent)] hover:bg-[var(--ch-surface)]">
          Explore the full student journey <ArrowRightIcon aria-hidden className="size-4" />
        </Link>
      </section>

      {testimonials.length > 0 && (
        <section className="ch-section ch-section--soft" aria-labelledby="reviews-heading">
          <p className="ch-eyebrow">Real student feedback</p>
          <h2 id="reviews-heading" className="ch-section__title">What students say after the search.</h2>
          <div className="ch-testimonials">
            {testimonials.slice(0, 4).map((testimonial) => (
              <figure key={testimonial.id} className="ch-testimonial">
                <div className="flex gap-1 text-[#ae5528]" aria-label={`${testimonial.overall_rating} out of 5 stars`}>
                  {Array.from({ length: testimonial.overall_rating }, (_, index) => <StarFilledIcon key={index} aria-hidden className="size-4" />)}
                </div>
                {testimonial.comment && <blockquote>“{testimonial.comment}”</blockquote>}
                <figcaption className="mt-4 text-sm font-bold text-teal-700">{testimonial.property_name}</figcaption>
              </figure>
            ))}
          </div>
        </section>
      )}

      <section className="ch-final-cta" aria-labelledby="cta-heading">
        <div className="ch-final-cta__inner">
          <div>
            <p className="ch-eyebrow">Ready when you are</p>
            <h2 id="cta-heading">Find a room that fits your semester.</h2>
          </div>
          <Link href={`/search?campus=${campus.code}`} className="inline-flex min-h-12 shrink-0 items-center justify-center gap-2 rounded-full bg-teal-900 px-6 text-sm font-bold text-white transition hover:bg-teal-700 active:scale-[0.98]">
            Search Makerere hostels <ArrowRightIcon aria-hidden />
          </Link>
        </div>
      </section>

      <section className="ch-section" aria-labelledby="guidance-heading">
        <div className="ch-local-guidance">
          <div className="ch-local-guidance__image">
            <Image src="/images/campushomes/student-lounge-hd-v2.webp" alt="Students spending time in a hostel common area" fill sizes="(min-width: 760px) 40vw, 100vw" className="object-cover" />
          </div>
          <div>
            <p className="ch-eyebrow">Local guidance</p>
            <h2 id="guidance-heading" className="ch-section__title">Know what the Verified badge covers.</h2>
            <p className="ch-section__lede">A CampusHomes inspector checks the location, rooms, amenities, photos, landlord identity and safety before a hostel is published. The badge records that visit; it does not replace your own viewing or tenancy agreement.</p>
            <div className="mt-7 flex flex-wrap gap-4">
              <Link href="/safety" className="inline-flex min-h-11 items-center gap-2 rounded-full border border-teal-700 px-5 text-sm font-bold text-teal-700 hover:bg-teal-50">Read our safety guidance <ArrowRightIcon aria-hidden /></Link>
              <Link href="/faqs" className="inline-flex min-h-11 items-center gap-2 font-bold text-teal-700 underline-offset-4 hover:underline">Read FAQs <ArrowRightIcon aria-hidden /></Link>
            </div>
          </div>
        </div>
      </section>
  </>;
}
