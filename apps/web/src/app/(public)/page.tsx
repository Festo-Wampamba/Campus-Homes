import type { ComponentType } from "react";
import Image from "next/image";
import Link from "next/link";
import {
  ArrowRightIcon,
  CameraIcon,
  CheckCircledIcon,
  ClockIcon,
  DimensionsIcon,
  HomeIcon,
  LockClosedIcon,
  MagnifyingGlassIcon,
  MixIcon,
  PersonIcon,
  SewingPinIcon,
  StarFilledIcon,
} from "@radix-ui/react-icons";
import {
  campusSchema,
  listingSearchResultSchema,
  testimonialSchema,
  VERIFICATION_CHECKLIST_COMPONENTS,
  type Campus,
  type Testimonial,
} from "@campushomes/shared";

import { CampusListingsTabs } from "@/components/campus-listings-tabs";
import { HomeSearch } from "@/components/home-search";
import { VerifiedBadge } from "@/components/verified-badge";
import { api } from "@/lib/api";
import { cn } from "@/lib/utils";

type MarketingIcon = ComponentType<{ className?: string }>;

const CHECKLIST_LABELS: Record<
  (typeof VERIFICATION_CHECKLIST_COMPONENTS)[number],
  { label: string; description: string; icon: MarketingIcon }
> = {
  location_gps: {
    label: "Location confirmed",
    description: "An inspector stands at the property and records its real GPS position.",
    icon: SewingPinIcon,
  },
  rooms_capacity: {
    label: "Rooms measured",
    description: "Room sizes and capacities are checked so the listing matches the building.",
    icon: DimensionsIcon,
  },
  amenities: {
    label: "Amenities tested",
    description: "Water, power, Wi-Fi and security are checked in person.",
    icon: MixIcon,
  },
  photos: {
    label: "Photos taken on site",
    description: "The images come from the inspection visit, not a marketing folder.",
    icon: CameraIcon,
  },
  landlord_identity: {
    label: "Landlord identified",
    description: "We confirm who owns or manages the property before it goes live.",
    icon: PersonIcon,
  },
  safety: {
    label: "Safety checked",
    description: "Locks, lighting and exits are reviewed before a listing earns the badge.",
    icon: LockClosedIcon,
  },
};

const CAMPUS_CARDS = [
  {
    code: "MUK",
    name: "Makerere University",
    area: "Wandegeya · Kikoni · Makerere",
    image: "/images/campushomes/makerere-campus-hd-v2.webp",
  },
  {
    code: "MUBS",
    name: "Makerere Business School",
    area: "Nakawa · Bugolobi · Banda",
    image: "/images/campushomes/student-lounge-hd-v2.webp",
  },
  {
    code: "KIU",
    name: "Kampala International University",
    area: "Kansanga · Kabalagala · Muyenga",
    image: "/images/campushomes/student-room-hd-v2.webp",
  },
  {
    code: "KYU",
    name: "Kyambogo University",
    area: "Kyambogo · Banda · Ntinda",
    image: "/images/campushomes/hero-hostel-hd-v2.webp",
  },
] as const;

const FAQS = [
  {
    question: "How much does it cost to reserve a room?",
    answer:
      "The reservation fee is a one-time UGX 5,000 payment. It holds your chosen room for 72 hours while you arrange the next steps.",
  },
  {
    question: "Do I pay rent through CampusHomes?",
    answer:
      "No. Rent, deposits and tenancy agreements stay directly between you and the landlord. CampusHomes does not collect or mark up your rent.",
  },
  {
    question: "What does Verified actually mean?",
    answer:
      "A CampusHomes inspector physically visited the property and confirmed location, rooms, amenities, photos, landlord identity and safety before publication.",
  },
  {
    question: "What happens when the 72 hours end?",
    answer:
      "If the reservation is not completed, the hold expires automatically and the room becomes available to other students again.",
  },
  {
    question: "Can I cancel a reservation?",
    answer:
      "Yes. A held reservation can be cancelled before it is fulfilled. The reservation area in your account shows the current status and next action.",
  },
];

const FEATURED_BOUNDS = {
  minLat: "0.25",
  maxLat: "0.42",
  minLon: "32.50",
  maxLon: "32.65",
};

async function getFeaturedListings() {
  try {
    const query = new URLSearchParams({ ...FEATURED_BOUNDS, limit: "50" });
    const rows = listingSearchResultSchema
      .array()
      .parse(await api<unknown>(`/listings/search?${query}`, { cache: "no-store" }));
    return rows.sort((a, b) => a.price_per_term_ugx - b.price_per_term_ugx);
  } catch {
    return [];
  }
}

async function getCampuses(): Promise<Campus[]> {
  try {
    return campusSchema.array().parse(
      await api<unknown>("/listings/campuses", { cache: "no-store" }),
    );
  } catch {
    return [];
  }
}

async function getTestimonials(): Promise<Testimonial[]> {
  try {
    return testimonialSchema.array().parse(
      await api<unknown>("/listings/reviews", { cache: "no-store" }),
    );
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

  return (
    <>
      <section className="relative isolate overflow-hidden bg-[oklch(0.205_0.026_195)] text-white">
        <div className="absolute inset-y-0 right-0 hidden w-[56%] lg:block">
          <Image
            src="/images/campushomes/hero-hostel-hd-v2.webp"
            alt="Students arriving at a hostel in Kampala"
            fill
            priority
            sizes="56vw"
            className="object-cover"
          />
          <div className="absolute inset-0 bg-linear-to-r from-[oklch(0.205_0.026_195)] via-[oklch(0.205_0.026_195)]/48 to-transparent" />
          <div className="absolute inset-0 bg-linear-to-t from-[oklch(0.205_0.026_195)]/55 via-transparent to-transparent" />
        </div>

        <div className="absolute inset-0 opacity-[0.055] [background-image:radial-gradient(circle_at_center,white_1px,transparent_1px)] [background-size:24px_24px]" />

        <div className="relative mx-auto grid min-h-[42rem] w-full max-w-7xl items-center px-4 py-16 sm:px-6 sm:py-20 lg:grid-cols-[minmax(0,0.92fr)_minmax(0,1.08fr)] lg:px-8 lg:py-24">
          <div className="marketing-reveal max-w-2xl">
            <div className="mb-6 flex items-center gap-3">
              <VerifiedBadge className="shadow-[0_8px_24px_-12px_rgba(0,0,0,0.55)]" />
              <span className="text-xs font-bold tracking-[0.16em] text-white/66 uppercase">
                Kampala&apos;s inspected student housing
              </span>
            </div>

            <h1 className="max-w-[12ch] text-4xl leading-[0.98] font-bold tracking-[-0.045em] text-white sm:text-5xl lg:text-[3.85rem]">
              Your room. Your campus. Verified.
            </h1>
            <p className="mt-6 max-w-xl text-base leading-7 text-white/72 sm:text-lg">
              Find a hostel we have physically inspected, compare honest room
              details, and hold your choice for 72 hours before someone else does.
            </p>

            <HomeSearch />

            <div className="mt-6 flex flex-wrap items-center gap-x-5 gap-y-3 text-xs font-semibold text-white/66">
              <span className="inline-flex items-center gap-2">
                <CheckCircledIcon className="size-4 text-coral-500" />
                Six checks on every listing
              </span>
              <span className="inline-flex items-center gap-2">
                <ClockIcon className="size-4 text-coral-500" />
                72-hour room hold
              </span>
            </div>
          </div>

          <div className="relative mt-10 min-h-72 overflow-hidden rounded-[1.5rem] border border-white/12 lg:hidden">
            <Image
              src="/images/campushomes/hero-hostel-hd-v2.webp"
              alt="Students arriving at a hostel in Kampala"
              fill
              priority
              sizes="100vw"
              className="object-cover"
            />
          </div>
        </div>
      </section>

      <section aria-label="CampusHomes facts" className="relative bg-background">
        <div className="mx-auto grid w-full max-w-7xl grid-cols-2 divide-x divide-y divide-border border-x border-b border-border bg-card sm:grid-cols-4 sm:divide-y-0">
          {[
            ["4", "launch universities"],
            ["6", "inspection checks"],
            ["72 hrs", "your room is held"],
            ["UGX 5,000", "one-time reservation"],
          ].map(([value, label]) => (
            <div key={label} className="px-5 py-6 text-center sm:px-6 sm:py-8">
              <p className="tabular font-display text-2xl font-bold tracking-tight text-teal-700 sm:text-3xl dark:text-coral-500">
                {value}
              </p>
              <p className="mt-1 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
                {label}
              </p>
            </div>
          ))}
        </div>
      </section>

      <section aria-labelledby="campus-heading" className="bg-background">
        <div className="mx-auto w-full max-w-7xl px-4 py-16 sm:px-6 sm:py-24 lg:px-8">
          <div className="flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="eyebrow">Start with your campus</p>
              <h2 id="campus-heading" className="mt-3 max-w-xl text-3xl tracking-[-0.035em] sm:text-4xl">
                Live close enough to make mornings easier.
              </h2>
            </div>
            <Link href="/search" className="text-link group">
              Browse every area
              <ArrowRightIcon className="size-4 transition-transform duration-300 group-hover:translate-x-1" />
            </Link>
          </div>

          <div className="mt-10 grid gap-4 md:grid-cols-2 lg:grid-cols-[1.35fr_0.9fr_0.9fr] lg:grid-rows-2">
            {CAMPUS_CARDS.map((campus, index) => (
              <Link
                key={campus.code}
                href={`/search?campus=${campus.code}`}
                className={cn(
                  "image-card group relative isolate min-h-64 overflow-hidden rounded-[1.25rem] bg-teal-900",
                  index === 0 && "lg:row-span-2 lg:min-h-[32rem]",
                  index === 3 && "md:col-span-2 lg:col-span-1",
                )}
              >
                <Image
                  src={campus.image}
                  alt={`Student housing near ${campus.name}`}
                  fill
                  sizes={index === 0 ? "(min-width: 1024px) 45vw, 100vw" : "(min-width: 1024px) 28vw, 50vw"}
                  className="object-cover transition-transform duration-700 ease-out group-hover:scale-[1.045]"
                />
                <div className="absolute inset-0 bg-linear-to-t from-[oklch(0.17_0.03_195)] via-[oklch(0.17_0.03_195)]/14 to-transparent" />
                <div className="absolute inset-x-0 bottom-0 p-5 text-white sm:p-6">
                  <span className="inline-flex rounded-full border border-white/20 bg-white/12 px-2.5 py-1 text-[0.68rem] font-bold tracking-[0.14em] uppercase backdrop-blur-md">
                    {campus.code}
                  </span>
                  <h3 className="mt-3 text-xl font-semibold text-white sm:text-2xl">{campus.name}</h3>
                  <p className="mt-1 text-sm text-white/68">{campus.area}</p>
                </div>
              </Link>
            ))}
          </div>
        </div>
      </section>

      <section className="bg-teal-50">
        <div className="mx-auto grid w-full max-w-7xl items-center gap-8 px-4 py-10 sm:px-6 lg:grid-cols-[1.05fr_0.95fr] lg:px-8 lg:py-14">
          <div className="relative min-h-72 overflow-hidden rounded-[1.5rem] lg:min-h-[25rem]">
            <Image
              src="/images/campushomes/student-lounge-hd-v2.webp"
              alt="Students studying together in a hostel lounge"
              fill
              sizes="(min-width: 1024px) 52vw, 100vw"
              className="object-cover"
            />
            <div className="absolute inset-0 bg-linear-to-t from-teal-900/55 via-transparent to-transparent" />
            <p className="absolute bottom-5 left-5 rounded-full border border-white/18 bg-[oklch(0.205_0.026_195)]/78 px-3 py-1.5 text-xs font-bold text-white backdrop-blur-md">
              Built around student life
            </p>
          </div>
          <div className="max-w-xl lg:pl-8">
            <p className="eyebrow">More than four walls</p>
            <h2 className="mt-3 text-3xl tracking-[-0.035em] sm:text-4xl">
              Find the place where study and life fit together.
            </h2>
            <p className="mt-5 text-md leading-7 text-muted-foreground">
              Compare room capacity, Wi-Fi, water, power, security and shared
              spaces before you travel across Kampala for a viewing. What you see
              is grounded in an on-site inspection.
            </p>
            <Link href="/search" className="mt-7 inline-flex h-12 items-center gap-2 rounded-lg bg-teal-900 px-6 font-bold text-white transition duration-300 hover:bg-teal-700 active:scale-[0.98]">
              Explore verified rooms
              <ArrowRightIcon className="size-4" />
            </Link>
          </div>
        </div>
      </section>

      <section aria-labelledby="featured-heading" className="bg-background">
        <div className="mx-auto w-full max-w-7xl px-4 py-16 sm:px-6 sm:py-24 lg:px-8">
          <div className="max-w-2xl">
            <p className="eyebrow">Available now</p>
            <h2 id="featured-heading" className="mt-3 text-3xl tracking-[-0.035em] sm:text-4xl">
              Verified hostels near campus.
            </h2>
            <p className="mt-4 text-md leading-7 text-muted-foreground">
              Every live card is backed by an inspected listing and current room data.
            </p>
          </div>
          <div className="mt-9">
            <CampusListingsTabs campuses={campusData} listings={featured} />
          </div>
        </div>
      </section>

      <section id="verified" aria-labelledby="verified-heading" className="overflow-hidden bg-[oklch(0.205_0.026_195)] text-white">
        <div className="mx-auto grid w-full max-w-7xl gap-12 px-4 py-16 sm:px-6 sm:py-24 lg:grid-cols-[0.8fr_1.2fr] lg:px-8">
          <div className="lg:sticky lg:top-28 lg:self-start">
            <p className="eyebrow text-coral-500">The CampusHomes badge</p>
            <h2 id="verified-heading" className="mt-4 max-w-[11ch] text-3xl tracking-[-0.035em] text-white sm:text-4xl">
              Verified means we stood in the room.
            </h2>
            <p className="mt-5 max-w-md text-base leading-7 text-white/62">
              A listing earns the badge only after all six checks pass on site.
              The rule is enforced by the platform, not left to marketing language.
            </p>
            <div className="mt-8 inline-flex items-center gap-3 rounded-xl border border-white/12 bg-white/6 p-3 pr-5">
              <VerifiedBadge />
              <span className="text-xs font-semibold text-white/68">One badge. One clear standard.</span>
            </div>
          </div>

          <ol className="divide-y divide-white/12 border-y border-white/12">
            {VERIFICATION_CHECKLIST_COMPONENTS.map((component, index) => {
              const item = CHECKLIST_LABELS[component];
              const Icon = item.icon;
              return (
                <li key={component} className="group grid grid-cols-[2.5rem_1fr_auto] items-start gap-4 py-5 sm:grid-cols-[3rem_0.75fr_1.25fr] sm:gap-6 sm:py-7">
                  <span className="tabular pt-1 font-display text-sm font-semibold text-white/32">
                    0{index + 1}
                  </span>
                  <div className="flex items-center gap-3">
                    <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-white/8 text-coral-500 transition duration-300 group-hover:bg-coral-500 group-hover:text-teal-900">
                      <Icon className="size-4" />
                    </span>
                    <h3 className="text-base font-semibold text-white">{item.label}</h3>
                  </div>
                  <p className="col-span-2 col-start-2 text-sm leading-6 text-white/54 sm:col-span-1 sm:col-start-auto">
                    {item.description}
                  </p>
                </li>
              );
            })}
          </ol>
        </div>
      </section>

      <section id="how-it-works" aria-labelledby="how-heading" className="bg-background">
        <div className="mx-auto w-full max-w-7xl px-4 py-16 sm:px-6 sm:py-24 lg:px-8">
          <p className="eyebrow">Three clear steps</p>
          <h2 id="how-heading" className="mt-3 max-w-2xl text-3xl tracking-[-0.035em] sm:text-4xl">
            From search to move-in, without the guessing.
          </h2>

          <ol className="mt-10 grid gap-4 lg:grid-cols-[1.2fr_0.8fr] lg:grid-rows-2">
            <li className="group relative isolate overflow-hidden rounded-[1.5rem] bg-coral-500 p-7 text-teal-900 sm:p-10 lg:row-span-2">
              <Image
                src="/images/campushomes/student-room-card.webp"
                alt="A bright student room with a study desk and garden view"
                fill
                sizes="(min-width: 1024px) 58vw, 100vw"
                className="object-cover object-center transition-transform duration-700 group-hover:scale-[1.03]"
              />
              <div
                aria-hidden
                className="absolute inset-0 bg-[linear-gradient(90deg,rgba(240,128,128,0.98)_0%,rgba(240,128,128,0.92)_34%,rgba(240,128,128,0.58)_62%,rgba(240,128,128,0.12)_100%)]"
              />
              <span className="relative z-10 tabular text-sm font-bold tracking-widest">01</span>
              <MagnifyingGlassIcon className="absolute top-8 right-8 z-10 size-14 opacity-25 transition-transform duration-500 group-hover:scale-110 group-hover:-rotate-6" />
              <div className="relative z-10 mt-28 max-w-lg sm:mt-40">
                <h3 className="text-2xl font-semibold sm:text-3xl">Search around your university</h3>
                <p className="mt-4 text-base leading-7 text-teal-900/74">
                  Compare inspected hostels near MUK, MUBS, KIU and KYU by price,
                  room capacity and the amenities that matter day to day.
                </p>
              </div>
            </li>
            <li className="group rounded-[1.5rem] border border-border bg-teal-50 p-7 sm:p-8">
              <div className="flex items-start justify-between gap-6">
                <span className="tabular text-sm font-bold tracking-widest text-teal-700">02</span>
                <ClockIcon className="size-8 text-teal-700 transition-transform duration-500 group-hover:rotate-12" />
              </div>
              <h3 className="mt-10 text-xl font-semibold">Hold the room for 72 hours</h3>
              <p className="mt-3 text-sm leading-6 text-muted-foreground">
                A one-time UGX 5,000 reservation holds the selected room while you arrange the rest.
              </p>
            </li>
            <li className="group rounded-[1.5rem] bg-teal-900 p-7 text-white sm:p-8">
              <div className="flex items-start justify-between gap-6">
                <span className="tabular text-sm font-bold tracking-widest text-white/48">03</span>
                <HomeIcon className="size-8 text-coral-500 transition-transform duration-500 group-hover:-translate-y-1" />
              </div>
              <h3 className="mt-10 text-xl font-semibold text-white">Move in and deal directly</h3>
              <p className="mt-3 text-sm leading-6 text-white/60">
                Confirm move-in, settle rent with the landlord and leave a structured review afterward.
              </p>
            </li>
          </ol>
        </div>
      </section>

      {testimonials.length > 0 && (
        <section aria-labelledby="reviews-heading" className="bg-teal-50">
          <div className="mx-auto w-full max-w-7xl px-4 py-16 sm:px-6 sm:py-24 lg:px-8">
            <p className="eyebrow">After move-in</p>
            <h2 id="reviews-heading" className="mt-3 text-3xl tracking-[-0.035em] sm:text-4xl">
              What students say.
            </h2>
            <ul className="mt-10 grid gap-5 lg:grid-cols-2">
              {testimonials.slice(0, 4).map((testimonial, index) => (
                <li
                  key={testimonial.id}
                  className={cn(
                    "border-t border-teal-900/15 pt-6",
                    index % 2 === 1 && "lg:translate-y-8",
                  )}
                >
                  <div className="flex gap-1 text-coral-600" aria-label={`${testimonial.overall_rating} out of 5 stars`}>
                    {Array.from({ length: testimonial.overall_rating }, (_, star) => (
                      <StarFilledIcon key={star} className="size-4" />
                    ))}
                  </div>
                  <blockquote className="mt-4 max-w-xl text-lg leading-8 text-foreground">
                    “{testimonial.comment}”
                  </blockquote>
                  <p className="mt-4 text-sm font-bold text-teal-700">{testimonial.property_name}</p>
                </li>
              ))}
            </ul>
          </div>
        </section>
      )}

      <section aria-labelledby="faq-heading" className="bg-background">
        <div className="mx-auto grid w-full max-w-7xl gap-10 px-4 py-16 sm:px-6 sm:py-24 lg:grid-cols-[0.75fr_1.25fr] lg:px-8">
          <div>
            <p className="eyebrow">Answers before you book</p>
            <h2 id="faq-heading" className="mt-3 text-3xl tracking-[-0.035em] sm:text-4xl">
              Questions students ask us.
            </h2>
            <p className="mt-4 max-w-sm text-md leading-7 text-muted-foreground">
              Clear terms matter when you are choosing where to live. Here are the essentials.
            </p>
          </div>
          <div className="divide-y divide-border border-y border-border">
            {FAQS.map((faq) => (
              <details key={faq.question} className="group py-1">
                <summary className="flex cursor-pointer list-none items-center justify-between gap-5 py-5 font-display text-base font-semibold marker:content-none sm:text-lg">
                  {faq.question}
                  <span className="flex size-8 shrink-0 items-center justify-center rounded-full border border-border text-lg font-normal text-teal-700 transition duration-300 group-open:rotate-45 group-open:bg-teal-50">
                    +
                  </span>
                </summary>
                <p className="max-w-2xl pb-6 pr-12 text-sm leading-7 text-muted-foreground">
                  {faq.answer}
                </p>
              </details>
            ))}
          </div>
        </div>
      </section>

      <section id="landlords" className="bg-teal-50">
        <div className="mx-auto w-full max-w-7xl px-4 py-16 sm:px-6 sm:py-24 lg:px-8">
          <div className="grid overflow-hidden rounded-[1.75rem] bg-teal-700 text-white lg:grid-cols-[1.05fr_0.95fr]">
            <div className="flex flex-col justify-center p-7 sm:p-12 lg:p-14">
              <p className="text-xs font-bold tracking-[0.16em] text-coral-500 uppercase">For hostel owners</p>
              <h2 className="mt-4 max-w-xl text-3xl tracking-[-0.035em] text-white sm:text-4xl">
                Fill rooms with students who know what to expect.
              </h2>
              <p className="mt-5 max-w-lg text-base leading-7 text-white/68">
                Get inspected once, publish honest room details and reach students searching near your campus catchment.
              </p>
              <a
                href="mailto:hello@campushomes.ug?subject=Landlord%20listing%20request"
                className="mt-8 inline-flex h-12 w-fit items-center gap-2 rounded-lg bg-white px-6 font-bold text-teal-900 transition duration-300 hover:bg-coral-500 active:scale-[0.98]"
              >
                Request a property inspection
                <ArrowRightIcon className="size-4" />
              </a>
            </div>
            <div className="relative min-h-72 lg:min-h-[31rem]">
              <Image
                src="/images/campushomes/student-room-hd-v2.webp"
                alt="A furnished student hostel room in Kampala"
                fill
                sizes="(min-width: 1024px) 48vw, 100vw"
                className="object-cover"
              />
              <div className="absolute inset-0 bg-linear-to-r from-teal-700/35 to-transparent lg:from-teal-700/55" />
            </div>
          </div>
        </div>
      </section>

      <section className="bg-coral-500 text-teal-900">
        <div className="mx-auto flex w-full max-w-7xl flex-col items-start justify-between gap-8 px-4 py-14 sm:px-6 md:flex-row md:items-center lg:px-8 lg:py-16">
          <div>
            <p className="text-xs font-bold tracking-[0.16em] uppercase">Your next room could be here</p>
            <h2 className="mt-3 max-w-2xl text-3xl tracking-[-0.035em] text-teal-900 sm:text-4xl">
              Ready to live closer to campus?
            </h2>
          </div>
          <Link
            href="/search"
            className="inline-flex h-12 shrink-0 items-center gap-2 rounded-lg bg-teal-900 px-6 font-bold text-white transition duration-300 hover:bg-teal-700 active:scale-[0.98]"
          >
            Start your search
            <ArrowRightIcon className="size-4" />
          </Link>
        </div>
      </section>
    </>
  );
}
