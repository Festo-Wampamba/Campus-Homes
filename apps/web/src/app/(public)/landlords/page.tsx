import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import {
  CheckCircle2,
  Clock3,
  Eye,
  LayoutDashboard,
  ListChecks,
  LockKeyhole,
  MessageCircle,
  ReceiptText,
  ShieldCheck,
  Sparkles,
  UsersRound,
} from "lucide-react";

import { api } from "@/lib/api";
import { CreateAccountDialog } from "./create-account-dialog";
import { LandlordSignupSteps } from "./landlord-signup-steps";
import { OnboardingLeadForm } from "./onboarding-lead-form";
import "./landlords.css";

export const metadata: Metadata = {
  title: "Manage and list your hostel",
  description: "Run your hostel's rooms, tenants and payments from one free, private dashboard, open any time. List rooms for students near Makerere when you're ready.",
  alternates: { canonical: "/landlords" },
};

const LANDLORD_PHOTO = "/images/campushomes/landlord-with-students.webp";

const HERO_POINTS = [
  { icon: Sparkles, label: "Free for the basics" },
  { icon: LockKeyhole, label: "Private to you" },
  { icon: Clock3, label: "Open 24/7, on any device" },
] as const;

// Management first, listing last: most landlords arrive thinking we only list
// rooms, so the page leads with what they run day to day.
const VALUE_PROPS = [
  { icon: LayoutDashboard, title: "Manage your hostel in one place", body: "Rooms, beds and occupancy for every property you own, kept current from one dashboard." },
  { icon: UsersRound, title: "Know your tenants", body: "Add walk-in students, confirm bookings and move-ins, and see each tenant's contact details when you need them." },
  { icon: ReceiptText, title: "Track payments with receipts", body: "Record booking fees and deposits, cash or mobile money. You and the student both get a receipt." },
  { icon: MessageCircle, title: "Talk to students directly", body: "Answer the students who reserved with you from the same dashboard, without sharing your personal number first." },
  { icon: LockKeyhole, title: "Your dashboard stays private", body: "Only you and an authorised Akolet support admin can see the information in your dashboard." },
  { icon: Eye, title: "List rooms when you're ready", body: "Choose which properties or rooms to publish. Only the listing details you publish are visible to students." },
] as const;

// What the online steps actually ask for (onboarding-wizard.tsx).
const SIGNUP_READY = [
  "An email or phone number you can receive a code on",
  "Your legal name as it appears on your ID",
  "The property's name and street address",
  "Photos and room prices, if you have them (optional)",
] as const;

const DASHBOARD_CAPABILITIES = [
  "Add properties, room types and beds",
  "Import your rooms from a spreadsheet",
  "Add walk-in students and record move-ins",
  "Record booking fees and deposits, with receipts",
  "Message students who reserved with you",
  "Keep availability accurate as rooms fill",
] as const;

async function getSupportContact() {
  return api<{ email: string; phone: string }>("/listings/support-contact").catch(() => ({
    email: "hello@campushomes.co.ug",
    phone: "",
  }));
}

export default async function LandlordsPage() {
  const support = await getSupportContact();
  const mailtoHref = `mailto:${support.email}?subject=Landlord%20listing%20request`;

  return (
    <div className="ch-public-page ch-landlords-page">
      <section className="ch-landlord-hero ch-landlords-hero" aria-labelledby="landlords-hero-heading">
        <Image
          src={LANDLORD_PHOTO}
          alt=""
          fill
          priority
          sizes="100vw"
          className="ch-landlords-hero__image"
        />
        <div className="ch-landlords-hero__scrim" aria-hidden="true" />
        <div className="ch-landlords-hero__inner">
          <div className="ch-landlords-hero__copy">
            <p className="ch-landlords-hero__eyebrow">Built for landlords &amp; hostel owners</p>
            <h1 id="landlords-hero-heading">
              <span>Your hostel</span> <span className="ch-landlords-hero__accent">Your control</span>
            </h1>
            <p className="ch-landlords-hero__lede">Run your rooms, tenants and payments from one free dashboard that stays private to you. List rooms for students near Makerere only when you&apos;re ready.</p>
            <div className="ch-landlords-hero__actions">
              <CreateAccountDialog />
              <Link href="/sign-in?next=/landlord" className="ch-landlords-hero__secondary-cta">Sign in to your dashboard</Link>
            </div>
            <ul className="ch-landlords-hero__points">
              {HERO_POINTS.map(({ icon: Icon, label }) => (
                <li key={label}><Icon aria-hidden="true" />{label}</li>
              ))}
            </ul>
            {support.phone && <p className="ch-landlords-hero__support">Prefer to talk first? <a href={`tel:${support.phone}`}>{support.phone}</a></p>}
          </div>
        </div>
      </section>

      <section className="ch-landlords-section" aria-labelledby="why-heading">
        <div className="ch-landlords-container">
          <div className="ch-landlords-showcase">
            <figure className="ch-landlords-showcase__media">
              <Image
                src={LANDLORD_PHOTO}
                alt="A hostel landlord talking with two students outside his building"
                fill
                sizes="(max-width: 1020px) 100vw, 50vw"
                className="ch-landlords-showcase__image"
              />
            </figure>
            <div className="ch-landlords-showcase__copy">
              <p className="ch-landlords-eyebrow">More than a listing</p>
              <h2 id="why-heading" className="ch-landlords-section__title">Run your whole hostel from one dashboard</h2>
              <p className="ch-landlords-section__lede">CampusHomes is your free platform for managing your properties. Keep track of rooms, tenants and payments every day, and connect with students looking for accommodation when you choose to.</p>
              <ul className="ch-landlords-showcase__stats">
                <li><UsersRound aria-hidden="true" /><span><strong>Tenants, rooms, payments</strong>One dashboard</span></li>
                <li><Clock3 aria-hidden="true" /><span><strong>Open 24/7</strong>Phone or laptop</span></li>
              </ul>
            </div>
          </div>
          <div className="ch-landlords-values ch-landlords-values--wide">
            {VALUE_PROPS.map(({ icon: Icon, title, body }) => (
              <article key={title} className="ch-landlords-value">
                <span className="ch-landlords-value__icon"><Icon aria-hidden="true" /></span>
                <div>
                  <h3>{title}</h3>
                  <p>{body}</p>
                </div>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="ch-landlords-section ch-landlords-section--soft" aria-labelledby="onboarding-heading">
        <div className="ch-landlords-container ch-landlords-signup">
          <div className="ch-landlords-signup__intro">
            <p className="ch-landlords-eyebrow">Create your landlord account</p>
            <h2 id="onboarding-heading" className="ch-landlords-section__title">From <span className="whitespace-nowrap">sign-up</span> to your dashboard in six steps</h2>
            <p className="ch-landlords-section__lede">The first four steps happen online and take one sitting. Then our team verifies your property, and your dashboard is ready.</p>
            <aside className="ch-landlords-signup__ready" aria-labelledby="signup-ready-heading">
              <h3 id="signup-ready-heading"><ListChecks aria-hidden="true" />Have these ready</h3>
              <ul>
                {SIGNUP_READY.map((item) => <li key={item}><CheckCircle2 aria-hidden="true" />{item}</li>)}
              </ul>
            </aside>
            <div className="ch-landlords-signup__cta">
              <CreateAccountDialog />
            </div>
            <div className="ch-landlords-process-note">
              <ShieldCheck aria-hidden="true" />
              <p><strong>Verification comes before publication.</strong> No room is shown to students until our team has visited and approved the property.</p>
            </div>
          </div>
          <LandlordSignupSteps />
        </div>
      </section>

      <section className="ch-landlords-section" aria-labelledby="dashboard-heading">
        <div className="ch-landlords-container">
        <div className="ch-landlords-dashboard">
          <div>
            <p className="ch-landlords-eyebrow">Inside your dashboard</p>
            <h2 id="dashboard-heading" className="ch-landlords-section__title">Everything your hostel needs, day to day</h2>
            <p className="ch-landlords-section__lede">Use the basic property-management tools for free, whether or not any of your rooms are listed publicly.</p>
          </div>
          <ul className="ch-landlords-capabilities">
            {DASHBOARD_CAPABILITIES.map((capability) => <li key={capability}><CheckCircle2 aria-hidden="true" /><span>{capability}</span></li>)}
          </ul>
        </div>
        </div>
      </section>

      <section id="request-onboarding" className="ch-landlords-section ch-landlords-section--soft ch-landlords-request" aria-labelledby="request-onboarding-heading">
        <div className="ch-landlords-container ch-landlords-container--narrow">
          <p className="ch-landlords-eyebrow">Let&apos;s get your hostel set up</p>
          <h2 id="request-onboarding-heading" className="ch-landlords-section__title">Request onboarding</h2>
          <p className="ch-landlords-section__lede">Tell us about your property and our team will reach out to arrange an onboarding visit.</p>
          <div className="ch-landlords-request__details">
            <aside className="ch-landlords-requirements" aria-label="Information needed to request onboarding">
              <ListChecks aria-hidden="true" />
              <div>
                <h3>Have these ready</h3>
                <p>Your name, phone number and property location are required for a callback.</p>
                <p>Email and extra property details are optional.</p>
              </div>
            </aside>
            <div className="ch-landlords-request__form"><OnboardingLeadForm /></div>
          </div>
          <p className="ch-landlords-request__email">Prefer email? <a href={mailtoHref}>{support.email}</a></p>
        </div>
      </section>
    </div>
  );
}
