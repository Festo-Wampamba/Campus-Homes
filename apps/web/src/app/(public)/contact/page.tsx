import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import {
  ArrowRight,
  ArrowUpRight,
  BookOpen,
  Building2,
  CircleHelp,
  Mail,
  MapPin,
  MessageCircle,
  Phone,
  ShieldAlert,
  Sparkles,
} from "lucide-react";

import type { Inquiry } from "@campushomes/shared";

import { SupportDesk } from "@/components/support/support-desk";
import { getServerSession } from "@/lib/session";
import { apiServerStrict } from "@/lib/server-api";
import { CAMPUSHOMES_CONTACT } from "@/lib/contact-details";
import { getMyReservations } from "@/lib/reservations";

import "./contact.css";

export const metadata: Metadata = {
  title: "Contact CampusHomes",
  description:
    "Contact the CampusHomes team by phone, WhatsApp or email, visit our Kampala office, or send a tracked inquiry as an active student.",
  alternates: { canonical: "/contact" },
};

const LISTING_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type ContactSearchParams = {
  listingId?: string;
  subject?: string;
};

export default async function ContactPage({
  searchParams,
}: {
  searchParams: Promise<ContactSearchParams>;
}) {
  const { listingId, subject } = await searchParams;
  const reportContext = listingId && LISTING_ID_PATTERN.test(listingId)
    ? { listingId, subject: (subject || "Report a listing").slice(0, 200) }
    : undefined;

  const returnQuery = new URLSearchParams();
  if (reportContext) { returnQuery.set("listingId", reportContext.listingId); returnQuery.set("subject", reportContext.subject); }
  const signInHref = `/sign-in?next=${encodeURIComponent(`/contact${returnQuery.size ? `?${returnQuery}` : ""}#message`)}`;

  const session = await getServerSession();
  const isStudent = session?.user.status === "active" && session.access.workspaces.includes("student");

  const [inquiries, reservations] = isStudent
    ? await Promise.all([
        apiServerStrict<Inquiry[]>("/inquiries/mine").catch(() => []),
        getMyReservations(),
      ])
    : [[], []];

  const safetyReportSubject = encodeURIComponent("CampusHomes safety report");
  const inquiryDesk = isStudent ? (
    <SupportDesk
      key={reportContext ? `${reportContext.listingId}:${reportContext.subject}` : "general"}
      initialInquiries={inquiries}
      reservations={reservations}
      reportContext={reportContext}
    />
  ) : null;

  return (
    <div className="ch-public-page ch-contact-page">
      <section className="ch-contact-hero" aria-labelledby="contact-hero-heading">
        <Image
          src="/images/campushomes/student-lounge-hd-v2.webp"
          alt=""
          fill
          priority
          sizes="100vw"
          className="ch-contact-hero__image"
        />
        <div className="ch-contact-hero__inner">
          <div className="ch-contact-hero__copy">
            <p className="ch-contact-eyebrow">CampusHomes contact</p>
            <h1 id="contact-hero-heading">Contact CampusHomes.</h1>
            <p>
              Talk to the CampusHomes team about a listing, a reservation, landlord questions or a safety concern.
              Choose the channel that suits you and keep your housing search moving.
            </p>
            <div className="ch-contact-hero__actions">
              <a href={`tel:${CAMPUSHOMES_CONTACT.officePhone}`} className="ch-contact-button ch-contact-button--primary">
                <Phone aria-hidden />
                Call the office
              </a>
              <a href="#message" className="ch-contact-button ch-contact-button--outline">
                <MessageCircle aria-hidden />
                {isStudent ? "Send a student inquiry" : "Track a student inquiry"}
              </a>
            </div>
          </div>


        </div>
      </section>

      <div className="ch-contact-content">
        <section className="ch-contact-section" aria-labelledby="direct-heading">
          <div className="ch-contact-section__header">
            <div>
              <p className="ch-contact-eyebrow ch-contact-eyebrow--dark">Reach us directly</p>
              <h2 id="direct-heading">Talk to our team.</h2>
            </div>
            <p>
              Use whichever option is easiest. These are the CampusHomes contact details for the Akolet team&apos;s
              shared office.
            </p>
          </div>

          <div className="ch-contact-channel-grid">
            <a href={`tel:${CAMPUSHOMES_CONTACT.officePhone}`} className="ch-contact-channel">
              <span className="ch-contact-channel__icon"><Phone aria-hidden /></span>
              <span className="ch-contact-channel__label">Call the office</span>
              <strong>{CAMPUSHOMES_CONTACT.officePhoneLabel}</strong>
              <span className="ch-contact-channel__hint">For questions that are easier to explain aloud.</span>
              <span className="ch-contact-channel__action">Call now <ArrowUpRight aria-hidden /></span>
            </a>

            <a
              href={CAMPUSHOMES_CONTACT.whatsappHref}
              className="ch-contact-channel ch-contact-channel--whatsapp"
              target="_blank"
              rel="noopener noreferrer"
            >
              <span className="ch-contact-channel__icon"><MessageCircle aria-hidden /></span>
              <span className="ch-contact-channel__label">WhatsApp</span>
              <strong>{CAMPUSHOMES_CONTACT.whatsappPhoneLabel}</strong>
              <span className="ch-contact-channel__hint">Send a quick message to the CampusHomes team.</span>
              <span className="ch-contact-channel__action">Open WhatsApp <ArrowUpRight aria-hidden /></span>
            </a>

            <a href={`mailto:${CAMPUSHOMES_CONTACT.email}`} className="ch-contact-channel">
              <span className="ch-contact-channel__icon"><Mail aria-hidden /></span>
              <span className="ch-contact-channel__label">Email</span>
              <strong>{CAMPUSHOMES_CONTACT.email}</strong>
              <span className="ch-contact-channel__hint">Share the details when your question needs context.</span>
              <span className="ch-contact-channel__action">Write an email <ArrowUpRight aria-hidden /></span>
            </a>
          </div>
        </section>

        <section className="ch-contact-office" aria-labelledby="office-heading">
          <div className="ch-contact-office__copy">
            <p className="ch-contact-eyebrow ch-contact-eyebrow--dark">Visit us</p>
            <h2 id="office-heading">Visit our Kampala office.</h2>
            <p>
              Our team works from the Akolet office at Maimood Hostel, close to Makerere University&apos;s Eastern Gate.
              Contact us before visiting so we can help with the best next step.
            </p>
            <address>
              <span>{CAMPUSHOMES_CONTACT.office}</span>
              <span>{CAMPUSHOMES_CONTACT.locality}</span>
            </address>
            <a
              href={CAMPUSHOMES_CONTACT.mapsHref}
              className="ch-contact-button ch-contact-button--dark"
              target="_blank"
              rel="noopener noreferrer"
            >
              <MapPin aria-hidden />
              Open directions
              <ArrowUpRight aria-hidden />
            </a>
          </div>
          <div className="ch-contact-office__marker">
            <Building2 aria-hidden className="size-9" />
            <h3>CampusHomes, developed by Akolet.</h3>
            <p>Our team uses Akolet’s shared office, phone and email channels for CampusHomes inquiries.</p>
            <a href={CAMPUSHOMES_CONTACT.developerHref} target="_blank" rel="noopener noreferrer" className="ch-contact-inline-link">About Akolet <ArrowUpRight aria-hidden /></a>
          </div>
        </section>

        <section id="message" className="ch-contact-message" aria-labelledby="message-heading">
          <div className="ch-contact-section__header ch-contact-message__header">
            <div>
              <p className="ch-contact-eyebrow ch-contact-eyebrow--dark">Student inquiry desk</p>
              <h2 id="message-heading">Keep your question and replies together.</h2>
            </div>
            <p>
              {isStudent
                ? "Send a question to the CampusHomes team and track the team’s reply here. Listing reports keep their reference so our team can follow up."
                : "Student accounts can send a tracked question about a listing or reservation. Sign in to open the inquiry desk; direct contact channels remain available to everyone."}
            </p>
          </div>

          {inquiryDesk ?? (
            <div className="ch-contact-signin">
              <div className="ch-contact-signin__icon"><CircleHelp aria-hidden /></div>
              <div>
                <h3>Want to track a student question?</h3>
                <p>
                  Sign in with an active student account to send an inquiry and see the reply here. If you are a
                  landlord, staff member or visitor, call, WhatsApp or email us directly above.
                </p>
                <Link
                  href={signInHref}
                  className="ch-contact-inline-link"
                >
                  Sign in to open the inquiry desk <ArrowRight aria-hidden />
                </Link>
              </div>
            </div>
          )}
        </section>

        <section className="ch-contact-safety" aria-labelledby="safety-heading">
          <div className="ch-contact-safety__icon"><ShieldAlert aria-hidden /></div>
          <div className="ch-contact-safety__copy">
            <p className="ch-contact-eyebrow ch-contact-eyebrow--dark">Safety and listing reports</p>
            <h2 id="safety-heading">Something does not match what you were promised?</h2>
            <p>
              Active students should use the inquiry desk with the listing reference so the CampusHomes team can
              investigate it. If you cannot sign in, email the office with the subject “CampusHomes safety report” and
              include the hostel name and any reservation or message reference you have.
            </p>
            <div className="ch-contact-safety__actions">
              {isStudent ? (
                <a href="#message" className="ch-contact-inline-link">Use the inquiry desk <ArrowRight aria-hidden /></a>
              ) : (
                <Link href={signInHref} className="ch-contact-inline-link">
                  Sign in to report with context <ArrowRight aria-hidden />
                </Link>
              )}
              <a
                href={`mailto:${CAMPUSHOMES_CONTACT.email}?subject=${safetyReportSubject}`}
                className="ch-contact-inline-link ch-contact-inline-link--muted"
              >
                Email a safety report <ArrowUpRight aria-hidden />
              </a>
              <Link href="/safety" className="ch-contact-inline-link ch-contact-inline-link--muted">
                Read safety guidance <ArrowRight aria-hidden />
              </Link>
            </div>
          </div>
        </section>

        <section className="ch-contact-help" aria-labelledby="help-heading">
          <div className="ch-contact-section__header">
            <div>
              <p className="ch-contact-eyebrow ch-contact-eyebrow--dark">Keep exploring</p>
              <h2 id="help-heading">Find the next useful answer.</h2>
            </div>
            <p>Start with the help path that matches what you need right now.</p>
          </div>
          <div className="ch-contact-help-grid">
            <Link href="/support?tab=ai" className="ch-contact-help-card">
              <span className="ch-contact-help-card__icon"><Sparkles aria-hidden /></span>
              <span><strong>Ask CampusHomes AI</strong><small>Get an instant answer about finding and reserving a room.</small></span>
              <ArrowRight aria-hidden />
            </Link>
            <Link href="/support?tab=manual" className="ch-contact-help-card">
              <span className="ch-contact-help-card__icon"><BookOpen aria-hidden /></span>
              <span><strong>Read the user manual</strong><small>Follow the steps from search to a confirmed booking.</small></span>
              <ArrowRight aria-hidden />
            </Link>
            <Link href="/faqs" className="ch-contact-help-card">
              <span className="ch-contact-help-card__icon"><CircleHelp aria-hidden /></span>
              <span><strong>Browse FAQs</strong><small>See clear answers about inspections, holds and payments.</small></span>
              <ArrowRight aria-hidden />
            </Link>
            <Link href="/landlords" className="ch-contact-help-card">
              <span className="ch-contact-help-card__icon"><Building2 aria-hidden /></span>
              <span><strong>For landlords</strong><small>Learn how to bring a property to CampusHomes.</small></span>
              <ArrowRight aria-hidden />
            </Link>
          </div>
        </section>
      </div>
    </div>
  );
}
