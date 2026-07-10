import Link from "next/link";
import {
  BadgeCheck,
  Camera,
  KeyRound,
  MapPin,
  Search,
  ShieldCheck,
  Timer,
  UserCheck,
  Users,
  type LucideIcon,
} from "lucide-react";
import { VERIFICATION_CHECKLIST_COMPONENTS } from "@campushomes/shared";

import { VerifiedBadge } from "@/components/verified-badge";

// Human labels for the same enum the DB trigger enforces — if a component is
// added in shared, this page fails to compile until it gets a label.
const CHECKLIST_LABELS: Record<
  (typeof VERIFICATION_CHECKLIST_COMPONENTS)[number],
  { label: string; icon: LucideIcon }
> = {
  location_gps: { label: "GPS-confirmed location", icon: MapPin },
  rooms_capacity: { label: "Rooms & capacity", icon: Users },
  amenities: { label: "Amenities as listed", icon: BadgeCheck },
  photos: { label: "Honest photos", icon: Camera },
  landlord_identity: { label: "Landlord identity", icon: UserCheck },
  safety: { label: "Safety check", icon: ShieldCheck },
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

export default function HomePage() {
  return (
    <>
      {/* Hero — drenched in the brand teal; the badge introduces itself here */}
      <section className="bg-teal-900 text-white">
        <div className="mx-auto w-full max-w-6xl px-4 pt-16 pb-20 sm:px-6 sm:pt-24 sm:pb-28">
          <div className="max-w-2xl">
            <VerifiedBadge className="mb-5" />
            <h1 className="text-3xl font-bold text-white sm:text-4xl">
              A room near campus you can trust, held just for you.
            </h1>
            <p className="mt-4 max-w-xl text-md leading-relaxed text-white/80">
              Our team physically inspects every hostel before it goes live.
              Find one near your university, reserve it with a 72-hour hold,
              and move in with confidence.
            </p>
            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <Link
                href="/search"
                className="inline-flex h-12 items-center justify-center gap-2 rounded-md bg-coral-500 px-6 font-semibold text-teal-900 shadow-md transition-colors duration-150 hover:bg-coral-600 hover:text-white"
              >
                <Search aria-hidden className="size-4" strokeWidth={2.5} />
                Find housing near campus
              </Link>
              <Link
                href="/sign-in"
                className="inline-flex h-12 items-center justify-center rounded-md border border-white/30 px-6 font-semibold text-white transition-colors duration-150 hover:bg-white/10"
              >
                Sign in with your phone
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* The verification promise — the six real checklist components */}
      <section aria-labelledby="promise-heading" className="border-b border-border">
        <div className="mx-auto w-full max-w-6xl px-4 py-14 sm:px-6 sm:py-20">
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
          <ul className="mt-8 grid grid-cols-2 gap-x-6 gap-y-4 sm:grid-cols-3">
            {VERIFICATION_CHECKLIST_COMPONENTS.map((component) => {
              const { label, icon: Icon } = CHECKLIST_LABELS[component];
              return (
                <li key={component} className="flex items-center gap-2.5">
                  <span className="flex size-9 shrink-0 items-center justify-center rounded-md bg-teal-50 text-teal-700">
                    <Icon aria-hidden className="size-4.5" />
                  </span>
                  <span className="text-sm font-semibold">{label}</span>
                </li>
              );
            })}
          </ul>
        </div>
      </section>

      {/* How it works — a real ordered flow, so numbers earn their place */}
      <section id="how-it-works" aria-labelledby="how-heading" className="bg-muted">
        <div className="mx-auto w-full max-w-6xl px-4 py-14 sm:px-6 sm:py-20">
          <h2 id="how-heading" className="text-2xl">
            From searching to moving in
          </h2>
          <ol className="mt-8 grid gap-8 sm:grid-cols-3 sm:gap-6">
            {STEPS.map((step, i) => (
              <li key={step.title} className="flex gap-4 sm:flex-col">
                <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-primary font-display font-semibold text-primary-foreground">
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

      {/* Landlords */}
      <section id="landlords" aria-labelledby="landlord-heading">
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
              href="/sign-in"
              className="inline-flex h-11 shrink-0 items-center rounded-md bg-white px-5 font-semibold text-teal-900 shadow-xs transition-colors duration-150 hover:bg-teal-50"
            >
              List your property
            </Link>
          </div>
        </div>
      </section>
    </>
  );
}
