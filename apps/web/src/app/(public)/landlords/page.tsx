import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import {
  BadgeIcon,
  CalendarIcon,
  ChatBubbleIcon,
  DashboardIcon,
  EyeOpenIcon,
  HomeIcon,
  MixIcon,
  PersonIcon,
} from "@radix-ui/react-icons";

import { VerifiedBadge } from "@/components/verified-badge";
import { api } from "@/lib/api";
import { CreateAccountDialog } from "./create-account-dialog";
import { OnboardingLeadForm } from "./onboarding-lead-form";

export const metadata: Metadata = {
  title: "List your hostel",
  description: "List your hostel on CampusHomes. Our team inspects and verifies the property, then students near campus can find and reserve your rooms.",
  alternates: { canonical: "/landlords" },
};

const VALUE_PROPS = [
  {
    icon: EyeOpenIcon,
    title: "Seen by students near campus",
    body: "Your rooms appear when students search near their campus. A verified badge helps them choose with confidence.",
  },
  {
    icon: DashboardIcon,
    title: "Digitally manage your tenants",
    body: "Track properties, rooms and occupancy from one dashboard. No more spreadsheets or scattered notes to keep your listings current.",
  },
  {
    icon: ChatBubbleIcon,
    title: "Communication made easy",
    body: "Respond to booking requests and message tenants directly in the platform. Every conversation stays in one place.",
  },
  {
    icon: PersonIcon,
    title: "Support from our team",
    body: "Our operations team is available by phone and email when you need help with a listing.",
  },
] as const;

const STEPS = [
  {
    number: "01",
    icon: PersonIcon,
    title: "Create an account",
    body: "Create a secure CampusHomes account and add a landlord workspace. You keep any student access you already have.",
  },
  {
    number: "02",
    icon: BadgeIcon,
    title: "Verify your account",
    body: "One of our agents contacts you to verify your details, so students can trust every property that carries the CampusHomes badge.",
  },
  {
    number: "03",
    icon: HomeIcon,
    title: "List your property",
    body: "Once verified, you can publish room types, photos, prices and availability for students to view and book.",
  },
  {
    number: "04",
    icon: CalendarIcon,
    title: "Manage your bookings",
    body: "Use your dashboard to respond to bookings, message tenants and keep room availability current.",
  },
] as const;

const DASHBOARD_CAPABILITIES = [
  "Add properties and room types",
  "Upload room photos",
  "Set rent and other charges",
  "Keep availability accurate as rooms fill",
  "Respond to student inquiries and bookings",
] as const;

async function getSupportContact() {
  return api<{ email: string; phone: string }>("/listings/support-contact").catch(() => ({
    email: "hello@campushomes.ug",
    phone: "",
  }));
}

export default async function LandlordsPage() {
  const support = await getSupportContact();
  const mailtoHref = `mailto:${support.email}?subject=Landlord%20listing%20request`;

  return (
    <>
      <section className="relative isolate overflow-hidden bg-teal-900 text-white">
        <div className="absolute inset-0 z-0">
          <Image
            src="/images/campushomes/hero-hostel-hd-v2.webp"
            alt=""
            fill
            priority
            sizes="100vw"
            className="object-cover"
          />
          <div className="absolute inset-0 bg-linear-to-t from-teal-900/92 via-teal-900/70 to-teal-900/55" />
        </div>

        <div className="relative z-10 mx-auto w-full max-w-7xl px-4 py-20 sm:px-6 sm:py-28 lg:px-8">
          <div className="mx-auto max-w-2xl text-center">
            <div className="mb-5 inline-flex items-center gap-3">
              <VerifiedBadge className="shadow-[0_8px_24px_-12px_rgba(0,0,0,0.55)]" />
              <span className="text-xs font-bold tracking-[0.16em] text-white/66 uppercase">
                For hostel &amp; property owners
              </span>
            </div>
            <h1 className="font-display text-4xl font-bold leading-[1.12] tracking-[-0.035em] text-white sm:text-5xl">
              List your hostel on CampusHomes
            </h1>
            <p className="mt-6 text-base leading-7 text-white/78 sm:text-lg">
              Our team visits your property, verifies it, and helps you publish
              rooms, photos and prices for students searching near campus.
            </p>
            <div className="mt-9 flex flex-col items-center justify-center gap-3 sm:flex-row">
              <CreateAccountDialog />
              <Link
                href="/sign-in?next=/landlord"
                className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-lg border border-white/25 bg-white/5 px-6 font-bold text-white backdrop-blur-md transition duration-300 hover:bg-white/12 active:scale-[0.98] sm:w-auto"
              >
                Sign in to your dashboard
              </Link>
            </div>
            {support.phone && (
              <p className="mt-5 text-sm text-white/64">
                Prefer to talk first? Call{" "}
                <a href={`tel:${support.phone}`} className="font-semibold text-white underline-offset-4 hover:underline">
                  {support.phone}
                </a>
              </p>
            )}
          </div>
        </div>
      </section>

      <section aria-labelledby="why-heading" className="bg-background">
        <div className="mx-auto w-full max-w-7xl px-4 py-16 sm:px-6 sm:py-24 lg:px-8">
          <div className="max-w-2xl">
            <p className="eyebrow">Why CampusHomes</p>
            <h2 id="why-heading" className="mt-3 text-3xl tracking-[-0.035em] sm:text-4xl">
              What you get as a landlord
            </h2>
          </div>
          <ul className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
            {VALUE_PROPS.map((item) => {
              const Icon = item.icon;
              return (
                <li key={item.title} className="rounded-[1.5rem] border border-border bg-teal-50 p-7 sm:p-8">
                  <span className="flex size-11 items-center justify-center rounded-lg bg-teal-900 text-coral-500">
                    <Icon className="size-5" />
                  </span>
                  <h3 className="mt-6 text-lg font-semibold">{item.title}</h3>
                  <p className="mt-3 text-sm leading-6 text-muted-foreground">{item.body}</p>
                </li>
              );
            })}
          </ul>
        </div>
      </section>

      <section aria-labelledby="how-heading" className="bg-teal-900 text-white">
        <div className="mx-auto w-full max-w-7xl px-4 py-16 sm:px-6 sm:py-24 lg:px-8">
          <p className="text-xs font-bold tracking-[0.16em] text-coral-500 uppercase">How onboarding works</p>
          <h2 id="how-heading" className="mt-3 max-w-xl text-3xl tracking-[-0.035em] text-white sm:text-4xl">
            Create your account, then our team helps you get listed.
          </h2>
          <p className="mt-4 max-w-lg text-sm leading-6 text-white/60">
            Creating or reusing your secure account takes a minute. A real
            person from our operations team then walks your property through
            verification and publishing.
          </p>

          <ol className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {STEPS.map((step) => {
              const Icon = step.icon;
              return (
                <li key={step.number} className="rounded-[1.5rem] border border-white/12 bg-white/6 p-7 sm:p-8">
                  <div className="flex items-center justify-between">
                    <span className="tabular text-sm font-bold tracking-widest text-white/40">{step.number}</span>
                    <Icon className="size-6 text-coral-500" />
                  </div>
                  <h3 className="mt-8 text-lg font-semibold text-white">{step.title}</h3>
                  <p className="mt-3 text-sm leading-6 text-white/62">{step.body}</p>
                </li>
              );
            })}
          </ol>
        </div>
      </section>

      <section aria-labelledby="dashboard-heading" className="bg-background">
        <div className="mx-auto grid w-full max-w-7xl items-center gap-10 px-4 py-16 sm:px-6 sm:py-24 lg:grid-cols-[0.95fr_1.05fr] lg:px-8">
          <div>
            <p className="eyebrow">Once you&apos;re live</p>
            <h2 id="dashboard-heading" className="mt-3 max-w-md text-3xl tracking-[-0.035em] sm:text-4xl">
              Your dashboard keeps every listing current.
            </h2>
            <p className="mt-5 max-w-md text-md leading-7 text-muted-foreground">
              After your first property is verified, you can manage routine updates directly.
            </p>
          </div>
          <ul className="divide-y divide-border border-y border-border">
            {DASHBOARD_CAPABILITIES.map((capability) => (
              <li key={capability} className="flex items-center gap-3 py-4">
                <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-teal-50 text-teal-700">
                  <MixIcon className="size-3.5" />
                </span>
                <span className="text-sm font-medium text-foreground">{capability}</span>
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section id="request-onboarding" aria-labelledby="request-onboarding-heading" className="bg-background">
        <div className="mx-auto w-full max-w-2xl px-4 py-16 sm:px-6 sm:py-24 lg:px-8">
          <h2 id="request-onboarding-heading" className="text-center text-3xl tracking-[-0.035em] sm:text-4xl">
            Request onboarding
          </h2>
          <p className="mt-3 text-center text-sm text-muted-foreground">
            Tell us about your property, especially if you are far from Kampala. Our team
            will reach out to arrange the next steps.
          </p>
          <div className="mt-8">
            <OnboardingLeadForm />
          </div>
          <p className="mt-4 text-center text-xs text-muted-foreground">
            Prefer email?{" "}
            <a href={mailtoHref} className="font-semibold underline underline-offset-4 hover:text-foreground">
              {support.email}
            </a>
          </p>
        </div>
      </section>
    </>
  );
}
