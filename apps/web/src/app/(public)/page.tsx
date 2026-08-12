import Link from "next/link";
import {
  ArrowRight,
  BadgeCheck,
  Building2,
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
  type ListingSearchResult,
  type Testimonial,
} from "@campushomes/shared";

import { api } from "@/lib/api";
import { CAMPUS_LOCATIONS } from "@/lib/campuses";
import { listingPhotoUrl } from "@/lib/cloudinary";
import { formatPriceRange, humanizeKey, roomSizeLabel } from "@/lib/format";
import { cn } from "@/lib/utils";
import { HomeSearch } from "@/components/home-search";
import { VerifiedBadge } from "@/components/verified-badge";

const CAMPUSES = Object.values(CAMPUS_LOCATIONS);

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
  const campusByCode = new Map(campusData.map((c) => [c.university, c]));

  return (
    <>
      {/* Hero — capped to exactly one screen on lg+ (viewport minus the
          h-14 header); below lg it auto-heights instead of forcing the
          photo row to fight the copy for the same 100vh, per review. Theme-
          aware: `.hero-aurora` is a soft teal wash with dark text in light
          mode, and only becomes the saturated teal aurora + white text
          under `.dark` (see globals.css) — the fixed dark-teal-always
          version never actually respected the theme toggle. The photo row
          is no longer `lg:block`-only (that silently hid it below 1024px,
          which is why it wasn't showing) — it's visible from `sm` up, each
          tile crossfading between two real listing photos (hero-crossfade)
          on top of the float bob. All motion is pure CSS (globals.css): no
          JS, no added bundle weight. */}
      <section className="hero-aurora relative flex h-auto min-h-[26rem] items-center overflow-hidden text-foreground dark:text-white lg:h-[calc(100vh-3.5rem)]">
        <div
          aria-hidden
          className="hero-spin-slow pointer-events-none absolute -top-16 -right-16 size-56 rotate-45 bg-teal-600/10 sm:size-72 dark:bg-coral-500/15"
        />
        <div
          aria-hidden
          className="hero-spin-slow pointer-events-none absolute -bottom-20 -left-16 size-64 rounded-full border-[3px] border-teal-600/10 [animation-direction:reverse] dark:border-white/10"
        />
        <div
          aria-hidden
          className="pointer-events-none absolute inset-y-0 left-0 hidden w-full bg-gradient-to-r from-black/45 via-black/10 to-transparent lg:w-[65%] dark:block"
        />
        <div className="relative mx-auto grid w-full max-w-6xl gap-5 px-4 py-6 sm:px-6 lg:grid-cols-[minmax(0,1fr)_20rem] lg:items-center lg:gap-10">
          <div className="max-w-2xl">
            <VerifiedBadge className="animate-in fade-in slide-in-from-bottom-4 mb-2.5 duration-700" />
            <h1 className="animate-in fade-in slide-in-from-bottom-4 text-3xl leading-[1.12] font-bold text-foreground delay-75 duration-700 fill-mode-both sm:text-4xl lg:text-5xl dark:text-white">
              <span className="text-teal-700 dark:text-coral-500">Verified</span> rooms, held
              just for you.
            </h1>
            <p className="animate-in fade-in slide-in-from-bottom-4 mt-3 max-w-xl text-sm leading-relaxed text-muted-foreground delay-150 duration-700 fill-mode-both sm:text-base dark:text-white/85">
              Real inspections, real photos — every hostel is physically
              checked before it goes live. Find yours near campus and lock
              it in with a 72-hour hold.
            </p>
            <div className="animate-in fade-in slide-in-from-bottom-4 mt-4 delay-200 duration-700 fill-mode-both">
              <HomeSearch />
            </div>

            {/* Real numbers, not decoration — every figure here is either a
                live count or a fixed platform rule, never invented
                (PRODUCT.md principle 5: never fake certainty the UI
                doesn't have). */}
            <div className="animate-in fade-in slide-in-from-bottom-4 mt-4 flex flex-wrap gap-x-8 gap-y-3 border-t border-border pt-3 delay-300 duration-700 fill-mode-both dark:border-white/15">
              {showcased.length > 0 && (
                <div>
                  <p className="tabular font-display text-2xl font-bold text-foreground sm:text-3xl dark:text-white">
                    {featured.length}+
                  </p>
                  <p className="mt-1 text-xs font-semibold text-muted-foreground dark:text-white/70">
                    verified {featured.length === 1 ? "hostel" : "hostels"} near
                    Makerere
                  </p>
                </div>
              )}
              <div>
                <p className="tabular font-display text-2xl font-bold text-foreground sm:text-3xl dark:text-white">
                  {CAMPUSES.length}
                </p>
                <p className="mt-1 text-xs font-semibold text-muted-foreground dark:text-white/70">
                  campuses covered
                </p>
              </div>
              <div>
                <p className="tabular font-display text-2xl font-bold text-teal-700 sm:text-3xl dark:text-coral-500">
                  72hr
                </p>
                <p className="mt-1 text-xs font-semibold text-muted-foreground dark:text-white/70">
                  hold — no rush, no double-booking
                </p>
              </div>
            </div>

            <ul className="mt-3 flex flex-wrap gap-2">
              {TRUST_CHIPS.map(({ label, icon: Icon }) => (
                <li
                  key={label}
                  className="inline-flex items-center gap-1.5 rounded-full border border-border bg-teal-50 px-2.5 py-1 text-xs font-semibold text-teal-900 dark:border-white/15 dark:bg-white/10 dark:text-white/90"
                >
                  <Icon aria-hidden className="size-3.5" />
                  {label}
                </li>
              ))}
            </ul>
          </div>

          {/* Real inspection photos, not stock art — the same rows the
              featured section below shows. Visible from `sm` up (below
              that the tiles alone would crowd out the copy within the
              height budget) — stacks under the copy until `lg`, where it
              moves beside it. Each tile bobs (hero-float) and, when a
              second photo is available for that slot, crossfades between
              the two (hero-crossfade). */}
          {showcased.length > 0 && (
            <div
              aria-hidden
              className="animate-in fade-in zoom-in-95 relative hidden h-44 delay-300 duration-700 fill-mode-both sm:block lg:h-56"
            >
              {[0, 1, 2].map((slot) => {
                const front = showcased[slot];
                if (!front) return null;
                const frontUrl = front.photo_storage_key ? listingPhotoUrl(front.photo_storage_key, 500) : null;
                if (!frontUrl) return null;
                const back = showcased[slot + 3];
                const backUrl = back?.photo_storage_key ? listingPhotoUrl(back.photo_storage_key, 500) : null;
                const layout = [
                  "top-0 left-4 size-28 rotate-[-4deg] z-30 lg:size-36",
                  "top-8 right-0 size-24 rotate-[3deg] z-20 lg:top-10 lg:size-32",
                  "bottom-0 left-12 size-20 rotate-[6deg] z-10 lg:left-16 lg:size-28",
                ][slot];
                return (
                  <div
                    key={front.id}
                    style={{ animationDelay: `${slot * 0.6}s`, animationDuration: `${5.5 + slot}s` }}
                    className={cn(
                      "hero-float absolute overflow-hidden rounded-xl border-4 border-white/60 shadow-xl dark:border-white/20",
                      layout,
                    )}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element -- unpredictable/hotlinked seed hosts, not worth next/image's remote-pattern allowlist churn for a decorative thumbnail */}
                    <img src={frontUrl} alt="" className="size-full object-cover" />
                    {backUrl && (
                      // eslint-disable-next-line @next/next/no-img-element -- see above
                      <img
                        src={backUrl}
                        alt=""
                        style={{ animationDelay: `${-4.5 + slot * 0.6}s` }}
                        className="hero-crossfade absolute inset-0 size-full object-cover"
                      />
                    )}
                    {slot === 0 && (
                      <VerifiedBadge size="sm" className="absolute top-2 left-2 z-10" />
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </section>

      {/* Browse by university — a direct route in, not just a generic
          search box. Each tile opens /search pre-centered on that campus. */}
      <section aria-labelledby="campuses-heading" className="border-b border-border">
        <div className="mx-auto w-full max-w-6xl px-4 py-10 sm:px-6 sm:py-14">
          <h2 id="campuses-heading" className="text-xl">
            Browse by university
          </h2>
          <ul className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
            {CAMPUSES.map((campus) => {
              const data = campusByCode.get(campus.code);
              const photoUrl = data?.photo_storage_key
                ? listingPhotoUrl(data.photo_storage_key, 400)
                : null;
              const hostelCount = data?.hostel_count ?? 0;
              return (
                <li key={campus.code}>
                  <Link
                    href={`/search?campus=${campus.code}`}
                    className="group block h-full overflow-hidden rounded-lg border border-border bg-card shadow-xs transition-all duration-150 hover:-translate-y-0.5 hover:border-teal-600 hover:shadow-md"
                  >
                    <div className="relative flex h-24 items-center justify-center overflow-hidden bg-gradient-to-br from-teal-700 to-teal-900">
                      {photoUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element -- campus tile thumbnail, arbitrary-origin storage URL
                        <img src={photoUrl} alt="" className="size-full object-cover" />
                      ) : (
                        <MapPin aria-hidden className="size-6 text-white/70" strokeWidth={1.5} />
                      )}
                    </div>
                    <div className="p-4">
                      <p className="font-semibold group-hover:text-teal-700">{campus.code}</p>
                      <p className="text-sm text-muted-foreground">{campus.name}</p>
                      <p className="mt-2 text-xs font-semibold text-teal-700">
                        {hostelCount} {hostelCount === 1 ? "hostel" : "hostels"}
                      </p>
                    </div>
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      </section>

      {/* Featured hostels — real, live, verified rows; a guest sees exactly
          what a signed-in student would find in search. */}
      <section aria-labelledby="featured-heading" className="border-b border-border">
        <div className="mx-auto w-full max-w-6xl px-4 py-14 sm:px-6 sm:py-20">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div className="max-w-xl">
              <h2 id="featured-heading" className="text-2xl">
                Verified hostels, live right now
              </h2>
              <p className="mt-3 text-md text-muted-foreground">
                No filler listings — every card below is a real, inspected
                hostel a student could reserve today.
              </p>
            </div>
            <Link
              href="/search"
              className="inline-flex items-center gap-1.5 text-sm font-semibold text-teal-700 transition-colors hover:text-teal-900"
            >
              See all on the map
              <ArrowRight aria-hidden className="size-4" />
            </Link>
          </div>

          {showcased.length > 0 ? (
            <ul className="mt-8 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
              {showcased.map((row) => (
                <FeaturedCard key={row.id} row={row} />
              ))}
            </ul>
          ) : (
            <div className="mt-8 flex flex-col items-center gap-3 rounded-xl border border-dashed border-border py-14 text-center">
              <Building2 aria-hidden className="size-8 text-muted-foreground" />
              <p className="max-w-sm text-sm text-muted-foreground">
                New verified hostels are going live as our inspectors confirm
                them. Check the search map — new listings appear there first.
              </p>
              <Link
                href="/search"
                className="inline-flex h-10 items-center rounded-md bg-primary px-4 text-sm font-semibold text-primary-foreground shadow-xs transition-colors duration-150 hover:bg-teal-700"
              >
                Open the search map
              </Link>
            </div>
          )}
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
    </>
  );
}

function FeaturedCard({ row }: { row: ListingSearchResult }) {
  const amenities = Object.entries(row.amenities)
    .filter(([, has]) => has)
    .map(([key]) => humanizeKey(key))
    .slice(0, 3);
  const initial = row.name.charAt(0).toUpperCase();
  const photoUrl = row.photo_storage_key ? listingPhotoUrl(row.photo_storage_key, 500) : null;
  const rooms = roomSizeLabel(row);

  return (
    <li>
      <Link
        href={`/listings/${row.id}`}
        className="group block h-full overflow-hidden rounded-lg border border-border bg-card shadow-xs transition-all duration-150 hover:-translate-y-0.5 hover:shadow-md"
      >
        <div className="relative flex h-40 items-center justify-center overflow-hidden bg-gradient-to-br from-teal-700 to-teal-900">
          {photoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element -- unpredictable/hotlinked seed hosts, not worth next/image's remote-pattern allowlist churn for a card thumbnail
            <img
              src={photoUrl}
              alt={row.name}
              className="size-full object-cover"
              loading="lazy"
            />
          ) : (
            <>
              <span
                aria-hidden
                className="font-display text-6xl font-bold text-white/15 select-none"
              >
                {initial}
              </span>
              <Building2
                aria-hidden
                className="absolute size-8 text-white/70"
                strokeWidth={1.5}
              />
            </>
          )}
          <VerifiedBadge size="sm" className="absolute top-3 left-3" />
        </div>
        <div className="p-4">
          <div className="flex items-start justify-between gap-2">
            <h3 className="text-lg leading-snug group-hover:text-teal-700">
              {row.name}
            </h3>
          </div>
          <p className="mt-0.5 flex items-center gap-1 text-sm text-muted-foreground">
            <MapPin aria-hidden className="size-3.5 shrink-0" />
            {row.street_address}
          </p>
          {rooms && <p className="mt-2 text-sm text-muted-foreground">{rooms}</p>}
          {amenities.length > 0 && (
            <p className="mt-1 text-sm text-muted-foreground">
              {amenities.join(" · ")}
            </p>
          )}
          <p className="tabular mt-3 font-display text-lg font-semibold text-foreground">
            {row.room_categories.length > 1 && (
              <span className="mr-1 text-sm font-normal text-muted-foreground">From</span>
            )}
            {formatPriceRange(row.price_per_term_ugx, row.max_price_per_term_ugx)}
            <span className="text-sm font-normal text-muted-foreground"> / semester</span>
          </p>
          {row.room_categories.length > 1 && (
            <p className="mt-0.5 text-xs text-muted-foreground">
              {row.room_categories.length} room types
            </p>
          )}
        </div>
      </Link>
    </li>
  );
}
