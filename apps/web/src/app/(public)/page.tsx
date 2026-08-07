import Link from "next/link";
import {
  BadgeCheck,
  Camera,
  Handshake,
  KeyRound,
  MapPin,
  Search,
  ShieldCheck,
  Star,
  Timer,
  UserCheck,
  Users,
  type LucideIcon,
} from "lucide-react";
import {
  campusSchema,
  listingSearchResultSchema,
  testimonialSchema,
  VERIFICATION_CHECKLIST_COMPONENTS,
  type Campus,
  type Testimonial,
} from "@campushomes/shared";

import { api } from "@/lib/api";
import { listingPhotoUrl } from "@/lib/cloudinary";
import { cn } from "@/lib/utils";
import { CampusListingsTabs } from "@/components/campus-listings-tabs";
import { HomeSearch } from "@/components/home-search";
import { VerifiedBadge } from "@/components/verified-badge";

// Human labels for the same enum the DB trigger enforces — if a component is
// added in shared, this page fails to compile until it gets a label.
const CHECKLIST_LABELS: Record<
  (typeof VERIFICATION_CHECKLIST_COMPONENTS)[number],
  { label: string; description: string; icon: LucideIcon }
> = {
  location_gps: {
    label: "GPS-confirmed location",
    description: "We stand at the property and log its exact coordinates — no guessed pins.",
    icon: MapPin,
  },
  rooms_capacity: {
    label: "Rooms & capacity",
    description: "Every room is counted and measured, so the room types you see match what's actually there.",
    icon: Users,
  },
  amenities: {
    label: "Amenities as listed",
    description: "Water, power, wifi and security are checked in person, not taken on the landlord's word.",
    icon: BadgeCheck,
  },
  photos: {
    label: "Honest photos",
    description: "Photos are captured by our inspector on the visit, not supplied by the landlord.",
    icon: Camera,
  },
  landlord_identity: {
    label: "Landlord identity",
    description: "We confirm who actually owns or manages the property before it goes live.",
    icon: UserCheck,
  },
  safety: {
    label: "Safety check",
    description: "Locks, lighting and exits are checked before we put our badge on a listing.",
    icon: ShieldCheck,
  },
};

const STEPS: { title: string; body: string; icon: LucideIcon }[] = [
  {
    title: "Search near your campus",
    body: "Browse hostels around MUK, MUBS, KIU, and KYU. Every listing you see has already passed a physical inspection.",
    icon: Search,
  },
  {
    title: "Hold your room for 72 hours",
    body: "Pay a one-time UGX 5,000 reservation fee with Mobile Money. The unit is locked for you — no one else can take it while you arrange the rest.",
    icon: Timer,
  },
  {
    title: "Move in and settle rent directly",
    body: "Confirm your move-in, deal with your landlord directly on rent, and leave a structured review that keeps the platform honest.",
    icon: KeyRound,
  },
];

const TRUST_CHIPS: { label: string; icon: LucideIcon }[] = [
  { label: "6-point physical inspection", icon: ShieldCheck },
  { label: "72-hour reservation hold", icon: Timer },
  { label: "Rent paid direct to landlord", icon: Handshake },
];

const FAQS: { question: string; answer: string }[] = [
  {
    question: "How much does it cost to reserve a room?",
    answer:
      "A one-time UGX 5,000 fee, paid by Mobile Money. It holds your chosen room for 72 hours so nobody else can take it while you sort out the rest.",
  },
  {
    question: "Do I pay rent through CampusHomes?",
    answer:
      "No. Rent, deposits, and tenancy agreements are between you and the landlord directly — we never touch that money, and we never mark it up.",
  },
  {
    question: "What does “Verified” actually mean?",
    answer:
      "A CampusHomes inspector physically visited the property and confirmed all six checklist components on site — location, rooms, amenities, photos, landlord identity, and safety. It's enforced in our system, not just a claim.",
  },
  {
    question: "What happens if I don't pay within 72 hours?",
    answer:
      "Your hold expires automatically and the room becomes available to other students again. No penalty — you're free to reserve elsewhere.",
  },
  {
    question: "Can I cancel a reservation?",
    answer:
      "Yes, you can cancel a held reservation yourself before it's fulfilled. If you'd already paid the reservation fee, that payment is automatically refunded.",
  },
  {
    question: "How do I sign in?",
    answer:
      "With your phone number and a one-time code sent by SMS — no password to remember.",
  },
];

// Greater Makerere/Kampala catchment — same launch area the map opens on
// (listings-map.tsx INITIAL_CENTER). A wide, generous box so every verified
// listing in the launch catchment shows up here, not just the ones nearest
// the exact map pin.
const FEATURED_BOUNDS = {
  minLat: "0.25",
  maxLat: "0.42",
  minLon: "32.50",
  maxLon: "32.65",
};

async function getFeaturedListings() {
  try {
    const qs = new URLSearchParams({ ...FEATURED_BOUNDS, limit: "50" });
    const rows = listingSearchResultSchema
      .array()
      .parse(await api<unknown>(`/listings/search?${qs}`, { cache: "no-store" }));
    return rows.sort((a, b) => a.price_per_term_ugx - b.price_per_term_ugx);
  } catch {
    // The landing page must render even if the API is briefly unreachable —
    // the featured section just degrades to its empty state below.
    return [];
  }
}

async function getCampuses(): Promise<Campus[]> {
  try {
    return campusSchema.array().parse(await api<unknown>("/listings/campuses", { cache: "no-store" }));
  } catch {
    return [];
  }
}

// Only ever real, submitted reviews (RLS requires a fulfilled reservation to
// write one) — an empty array here means no student has reviewed yet, and
// the section below says exactly that rather than inventing quotes.
async function getTestimonials(): Promise<Testimonial[]> {
  try {
    return testimonialSchema.array().parse(await api<unknown>("/listings/reviews", { cache: "no-store" }));
  } catch {
    return [];
  }
}

export default async function HomePage() {
  const [featured, campusData, testimonials] = await Promise.all([
    getFeaturedListings(),
    getCampuses(),
    getTestimonials(),
  ]);
  const showcased = featured.slice(0, 6);

  return (
    <>
      {/* Hero — drenched in the brand teal; the badge introduces itself here.
          No decorative gradient orbs (PRODUCT.md anti-references: this reads
          as a competent institution, not a generic SaaS template) — the real
          inspection photos below do the visual work instead. */}
      <section className="relative overflow-hidden bg-teal-900 text-white">
        <div className="relative mx-auto grid w-full max-w-6xl gap-8 px-4 py-10 sm:px-6 sm:py-14 lg:grid-cols-[minmax(0,1fr)_22rem] lg:items-center lg:gap-10">
          <div className="max-w-xl">
            <VerifiedBadge className="mb-4" />
            <h1 className="text-2xl leading-tight font-bold text-white sm:text-3xl lg:text-4xl">
              A room near campus you can trust, held just for you.
            </h1>
            <p className="mt-3 max-w-xl text-sm leading-relaxed text-white/80 sm:text-base">
              Our team physically inspects every hostel before it goes live.
              Find one near your university, reserve it with a 72-hour hold,
              and move in with confidence.
            </p>
            <HomeSearch />

            <Link
              href="/sign-in"
              className="mt-4 inline-flex items-center text-sm font-semibold text-white/80 underline-offset-4 transition-colors duration-150 hover:text-white hover:underline"
            >
              Already have an account? Sign in with your phone
            </Link>

            {/* Real numbers, not decoration — the stat is only shown once
                there's live data to back it (PRODUCT.md principle 5: never
                fake certainty the UI doesn't have). */}
            {showcased.length > 0 && (
              <div className="mt-7 flex items-baseline gap-2 border-t border-white/15 pt-5">
                <span className="tabular font-display text-3xl font-bold text-white">
                  {featured.length}
                </span>
                <span className="text-sm text-white/70">
                  verified {featured.length === 1 ? "hostel" : "hostels"} ready
                  near Makerere right now
                </span>
              </div>
            )}

            <ul className="mt-4 flex flex-wrap gap-2">
              {TRUST_CHIPS.map(({ label, icon: Icon }) => (
                <li
                  key={label}
                  className="inline-flex items-center gap-1.5 rounded-full border border-white/15 bg-white/10 px-2.5 py-1 text-xs font-semibold text-white/90"
                >
                  <Icon aria-hidden className="size-3.5" />
                  {label}
                </li>
              ))}
            </ul>
          </div>

          {/* Real inspection photos, not stock art — the same rows the
              featured section below shows. Desktop only: there isn't room
              to do this justice next to the copy on a phone screen. */}
          {showcased.length > 0 && (
            <div
              aria-hidden
              className="relative hidden h-72 lg:block"
            >
              {showcased.slice(0, 3).map((row, i) => {
                const url = row.photo_storage_key ? listingPhotoUrl(row.photo_storage_key, 500) : null;
                if (!url) return null;
                const layout = [
                  "top-0 left-6 size-44 rotate-[-4deg] z-30",
                  "top-16 right-0 size-40 rotate-[3deg] z-20",
                  "bottom-0 left-20 size-36 rotate-[6deg] z-10",
                ][i];
                return (
                  <div
                    key={row.id}
                    className={cn(
                      "absolute overflow-hidden rounded-xl border-4 border-white/20 shadow-xl",
                      layout,
                    )}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element -- unpredictable/hotlinked seed hosts, not worth next/image's remote-pattern allowlist churn for a decorative thumbnail */}
                    <img src={url} alt="" className="size-full object-cover" />
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </section>

      {/* Verified hostels, filterable by university — a direct route in
          (not a generic search box) that lands on the same real, live rows
          a signed-in student would find in search. Replaces two separate
          sections (a browse-by-university tile grid and a flat featured
          grid) with one tabbed block. */}
      <section aria-labelledby="featured-heading" className="border-b border-border">
        <div className="mx-auto w-full max-w-6xl px-4 py-14 sm:px-6 sm:py-20">
          <div className="max-w-xl">
            <h2 id="featured-heading" className="text-2xl">
              Verified hostels, live right now
            </h2>
            <p className="mt-3 text-md text-muted-foreground">
              No filler listings — every card below is a real, inspected
              hostel a student could reserve today.
            </p>
          </div>
          <div className="mt-8">
            <CampusListingsTabs campuses={campusData} listings={featured} />
          </div>
        </div>
      </section>

      {/* The verification promise — the six real checklist components */}
      <section aria-labelledby="promise-heading" className="border-b border-border bg-muted">
        <div className="mx-auto w-full max-w-6xl px-4 py-16 sm:px-6 sm:py-24">
          <div className="max-w-xl">
            <h2 id="promise-heading" className="text-2xl">
              &ldquo;Verified&rdquo; means we stood in the room.
            </h2>
            <p className="mt-3 text-md text-muted-foreground">
              A listing only earns the badge after a CampusHomes inspector
              confirms all six components on site. No exceptions — the rule is
              enforced in our system, not just our policy.
            </p>
          </div>
          <ul className="mt-8 grid gap-x-8 gap-y-6 sm:grid-cols-2">
            {VERIFICATION_CHECKLIST_COMPONENTS.map((component) => {
              const { label, description, icon: Icon } = CHECKLIST_LABELS[component];
              return (
                <li key={component} className="flex items-start gap-3">
                  <span className="flex size-9 shrink-0 items-center justify-center rounded-md bg-teal-50 text-teal-700">
                    <Icon aria-hidden className="size-4.5" />
                  </span>
                  <div>
                    <p className="text-sm font-semibold">{label}</p>
                    <p className="mt-0.5 text-sm text-muted-foreground">{description}</p>
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      </section>

      {/* How it works — a real ordered flow, so numbers earn their place */}
      <section id="how-it-works" aria-labelledby="how-heading">
        <div className="mx-auto w-full max-w-6xl px-4 py-12 sm:px-6 sm:py-16">
          <h2 id="how-heading" className="text-2xl">
            From searching to moving in
          </h2>
          <ol className="mt-8 grid gap-8 sm:grid-cols-3 sm:gap-6">
            {STEPS.map((step, i) => (
              <li key={step.title} className="flex gap-4 sm:flex-col">
                <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-coral-500 font-display font-semibold text-teal-900">
                  {i + 1}
                </span>
                <div>
                  <h3 className="text-lg">{step.title}</h3>
                  <p className="mt-1.5 text-base leading-relaxed text-muted-foreground">
                    {step.body}
                  </p>
                </div>
              </li>
            ))}
          </ol>
          <p className="mt-8 max-w-xl text-sm text-muted-foreground">
            Rent, deposits, and tenancy agreements stay between you and your
            landlord — CampusHomes never touches them.
          </p>
        </div>
      </section>

      {/* Testimonials — only ever real, submitted reviews (RLS requires a
          fulfilled reservation to write one). Honest empty state until the
          first one exists, same principle as the featured-hostels section. */}
      <section aria-labelledby="testimonials-heading" className="border-b border-border bg-muted">
        <div className="mx-auto w-full max-w-6xl px-4 py-14 sm:px-6 sm:py-20">
          <h2 id="testimonials-heading" className="text-2xl">
            What students say
          </h2>
          {testimonials.length > 0 ? (
            <ul className="mt-8 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
              {testimonials.map((t) => (
                <li key={t.id} className="rounded-lg border border-border bg-card p-5 shadow-xs">
                  <div className="flex items-center gap-0.5" aria-label={`${t.overall_rating} out of 5 stars`}>
                    {Array.from({ length: 5 }, (_, i) => (
                      <Star
                        key={i}
                        aria-hidden
                        className={cn(
                          "size-4",
                          i < t.overall_rating
                            ? "fill-coral-500 text-coral-500"
                            : "text-border",
                        )}
                      />
                    ))}
                  </div>
                  <p className="mt-3 text-md leading-relaxed text-foreground">
                    &ldquo;{t.comment}&rdquo;
                  </p>
                  <p className="mt-3 text-sm font-semibold text-muted-foreground">
                    {t.property_name}
                  </p>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-4 max-w-lg text-md text-muted-foreground">
              No reviews yet — students leave a structured review after moving
              in, and the honest ones show up here first.
            </p>
          )}
        </div>
      </section>

      {/* FAQ */}
      <section aria-labelledby="faq-heading">
        <div className="mx-auto w-full max-w-3xl px-4 py-14 sm:px-6 sm:py-20">
          <h2 id="faq-heading" className="text-2xl">
            Frequently asked questions
          </h2>
          <div className="mt-6 divide-y divide-border rounded-lg border border-border">
            {FAQS.map((faq) => (
              <details key={faq.question} className="group p-4 sm:p-5">
                <summary className="flex cursor-pointer list-none items-center justify-between gap-3 font-semibold text-foreground marker:content-none">
                  {faq.question}
                  <span
                    aria-hidden
                    className="shrink-0 text-lg text-muted-foreground transition-transform duration-150 group-open:rotate-45"
                  >
                    +
                  </span>
                </summary>
                <p className="mt-2.5 text-md leading-relaxed text-muted-foreground">
                  {faq.answer}
                </p>
              </details>
            ))}
          </div>
        </div>
      </section>

      {/* Landlords */}
      <section id="landlords" aria-labelledby="landlord-heading" className="bg-muted">
        <div className="mx-auto w-full max-w-6xl px-4 py-14 sm:px-6 sm:py-20">
          <div className="flex flex-col items-start justify-between gap-6 rounded-xl bg-teal-700 p-6 text-white sm:flex-row sm:items-center sm:p-10">
            <div className="max-w-lg">
              <h2 id="landlord-heading" className="text-xl text-white">
                Own a hostel near campus?
              </h2>
              <p className="mt-2 text-base leading-relaxed text-white/80">
                Get verified once and reach students who are ready to reserve —
                not just enquire. Serious tenants, fewer no-shows, a reputation
                that compounds.
              </p>
            </div>
            <Link
              href="mailto:hello@campushomes.ug?subject=Landlord%20listing%20request"
              className="inline-flex h-11 shrink-0 items-center rounded-md bg-white px-5 font-semibold text-teal-900 shadow-xs transition-colors duration-150 hover:bg-teal-50"
            >
              Request to get listed
            </Link>
          </div>
        </div>
      </section>

      {/* Closing CTA — reuses teal-900 (the hero's own darkest brand token,
          already used for the site footer) rather than introducing a new
          dark neutral outside DESIGN.md's locked ramp. */}
      <section className="bg-teal-900 text-white">
        <div className="mx-auto flex w-full max-w-6xl flex-col items-center gap-4 px-4 py-14 text-center sm:px-6 sm:py-20">
          <h2 className="text-2xl text-white">Ready to find your room?</h2>
          <p className="max-w-md text-base text-white/80">
            Every listing here has already passed a physical inspection —
            start your search near campus.
          </p>
          <Link
            href="/search"
            className="mt-2 inline-flex h-11 items-center rounded-md bg-white px-6 font-semibold text-teal-900 shadow-xs transition-colors duration-150 hover:bg-teal-50"
          >
            Start your search
          </Link>
        </div>
      </section>
    </>
  );
}
