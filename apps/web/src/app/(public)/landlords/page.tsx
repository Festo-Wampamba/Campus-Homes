import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import {
  CalendarDays,
  CheckCircle2,
  CircleUserRound,
  Eye,
  House,
  LayoutDashboard,
  ListChecks,
  MessageCircle,
  ShieldCheck,
} from "lucide-react";

import { VerifiedBadge } from "@/components/verified-badge";
import { api } from "@/lib/api";
import { CreateAccountDialog } from "./create-account-dialog";
import { OnboardingLeadForm } from "./onboarding-lead-form";
import "./landlords.css";

export const metadata: Metadata = {
  title: "List your hostel",
  description: "List your hostel on CampusHomes. Our team inspects and verifies the property, then students near Makerere can find and reserve your rooms.",
  alternates: { canonical: "/landlords" },
};

const VALUE_PROPS = [
  { icon: Eye, title: "Reach students near campus", body: "Your rooms appear when students search around Makerere. The inspection badge gives them useful context before they contact you." },
  { icon: LayoutDashboard, title: "Keep availability current", body: "Manage your properties, room types, prices and availability from one landlord workspace." },
  { icon: MessageCircle, title: "Keep conversations together", body: "Respond to student questions, reservations and booking requests in one place." },
  { icon: CircleUserRound, title: "Get local support", body: "Our operations team can help with verification and with the first steps after you publish." },
] as const;

const STEPS = [
  { number: "01", icon: CircleUserRound, title: "Create an account", body: "Use your secure CampusHomes account and add a landlord workspace." },
  { number: "02", icon: ShieldCheck, title: "Complete verification", body: "Our operations team contacts you, checks your details and arranges a property visit." },
  { number: "03", icon: House, title: "Publish your rooms", body: "Add room types, photos, prices and availability after your property is approved." },
  { number: "04", icon: CalendarDays, title: "Manage your bookings", body: "Respond to reservations, messages and move-in updates from your dashboard." },
] as const;

const DASHBOARD_CAPABILITIES = [
  "Add properties and room types",
  "Upload room photos",
  "Set rent and other charges",
  "Keep availability accurate as rooms fill",
  "Respond to student enquiries and bookings",
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
          src="/images/campushomes/hero-hostel-hd-v2.webp"
          alt=""
          fill
          priority
          sizes="100vw"
          className="ch-landlords-hero__image"
        />
        <div className="ch-landlords-hero__scrim" aria-hidden="true" />
        <div className="ch-landlords-hero__inner">
          <div className="ch-landlords-hero__copy">
            <div className="ch-landlords-hero__eyebrow">
              <VerifiedBadge size="sm" />
              <span>For hostel and property owners</span>
            </div>
            <h1 id="landlords-hero-heading">List your hostel near Makerere.</h1>
            <p className="ch-landlords-hero__lede">Our team visits your property, verifies it and helps you publish accurate rooms, prices and availability for students searching around campus.</p>
            <div className="ch-landlords-hero__actions">
              <CreateAccountDialog />
              <Link href="/sign-in?next=/landlord" className="ch-landlords-hero__secondary-cta">Sign in to your dashboard</Link>
            </div>
            {support.phone && <p className="ch-landlords-hero__support">Prefer to talk first? <a href={`tel:${support.phone}`}>{support.phone}</a></p>}
          </div>
        </div>
      </section>

      <section className="ch-landlords-section" aria-labelledby="why-heading">
        <div className="ch-landlords-container">
          <p className="ch-landlords-eyebrow">A useful landlord workspace</p>
          <h2 id="why-heading" className="ch-landlords-section__title">Help students choose your property with confidence.</h2>
        <div className="ch-landlords-values">
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
        <div className="ch-landlords-container">
        <p className="ch-landlords-eyebrow">How onboarding works</p>
        <h2 id="onboarding-heading" className="ch-landlords-section__title">Create your account, then our team helps you get listed.</h2>
        <p className="ch-landlords-section__lede">The property visit keeps the published information grounded. You still control your rent, tenancy terms and day-to-day relationship with the student.</p>
        <ol className="ch-landlords-steps">
          {STEPS.map(({ number, icon: Icon, title, body }) => (
            <li key={number} className="ch-landlords-step">
              <div className="ch-landlords-step__top"><span>{number}</span><Icon aria-hidden="true" /></div>
              <h3>{title}</h3>
              <p>{body}</p>
            </li>
          ))}
        </ol>
        <div className="ch-landlords-process-note">
          <ShieldCheck aria-hidden="true" />
          <p><strong>Verification comes before publication.</strong> We review your landlord details and arrange a physical property verification before a listing goes live.</p>
        </div>
        </div>
      </section>

      <section className="ch-landlords-section" aria-labelledby="dashboard-heading">
        <div className="ch-landlords-container">
        <div className="ch-landlords-dashboard">
          <div>
            <p className="ch-landlords-eyebrow">Once your property is live</p>
            <h2 id="dashboard-heading" className="ch-landlords-section__title">Keep every listing current.</h2>
            <p className="ch-landlords-section__lede">Students make better decisions when room availability, prices and property details stay up to date.</p>
          </div>
          <ul className="ch-landlords-capabilities">
            {DASHBOARD_CAPABILITIES.map((capability) => <li key={capability}><CheckCircle2 aria-hidden="true" /><span>{capability}</span></li>)}
          </ul>
        </div>
        </div>
      </section>

      <section id="request-onboarding" className="ch-landlords-section ch-landlords-section--soft ch-landlords-request" aria-labelledby="request-onboarding-heading">
        <div className="ch-landlords-container ch-landlords-container--narrow">
          <p className="ch-landlords-eyebrow">Start a conversation</p>
          <h2 id="request-onboarding-heading" className="ch-landlords-section__title">Request onboarding.</h2>
          <p className="ch-landlords-section__lede">Tell us about your property and our team will reach out with the next steps.</p>
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
