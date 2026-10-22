import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { ArrowRight, Eye, ShieldCheck, WalletCards } from "lucide-react";

import JourneyShowcase from "./journey-showcase";

import "./how-it-works.css";

export const metadata: Metadata = {
  title: "How CampusHomes works",
  description:
    "See the CampusHomes journey from your first search to a confirmed booking and move-in near Makerere University.",
  alternates: { canonical: "/how-it-works" },
  openGraph: {
    title: "How CampusHomes works",
    description:
      "A clear path from searching inspected hostels to moving into a room you have chosen with confidence.",
    url: "/how-it-works",
    type: "website",
  },
};

export default function HowItWorksPage() {
  return (
    <div className="ch-public-page ch-journey-page">
      <section className="ch-journey-hero" aria-labelledby="journey-hero-heading">
        <div className="ch-journey-hero__texture" aria-hidden="true" />
        <div className="ch-journey-hero__inner">
          <div className="ch-journey-hero__copy">
            <p className="ch-journey-eyebrow">How CampusHomes works</p>
            <h1 id="journey-hero-heading"><span>Your next room.</span><span>One clear journey.</span></h1>
            <p className="ch-journey-hero__lede">
              See the route from search to move-in on desktop or phone. Compare inspected hostels, reserve for free and
              keep the next step clear.
            </p>
            <div className="ch-journey-hero__actions">
              <Link href="/search" className="ch-journey-button ch-journey-button--primary">
                Start searching <ArrowRight aria-hidden="true" />
              </Link>
              <Link href="/contact" className="ch-journey-button ch-journey-button--quiet">
                Talk to our team
              </Link>
            </div>
            <p className="ch-journey-hero__promise">
              <ShieldCheck aria-hidden="true" />
              <span>Inspected listings give you useful context before you visit.</span>
            </p>
          </div>

          <div className="ch-journey-hero__visual" aria-label="A preview of the CampusHomes search journey">
            <div className="ch-journey-hero__image-wrap">
              <Image
                src="/images/campushomes/hero-hostel-hd-v2.webp"
                alt="A hostel exterior in Kampala"
                fill
                priority
                sizes="(min-width: 900px) 46vw, 92vw"
                className="ch-journey-hero__image"
              />
              <div className="ch-journey-hero__image-scrim" aria-hidden="true" />
              <div className="ch-journey-hero__image-caption">
                <span className="ch-journey-hero__caption-kicker">Your path, in view</span>
                <strong>Search · Reserve · Confirm</strong>
                <span>Move at the pace that feels right.</span>
              </div>
            </div>
            <div className="ch-journey-hero__float ch-journey-hero__float--top" aria-hidden="true">
              <span className="ch-journey-hero__float-icon"><Eye /></span>
              <span><strong>See the room first.</strong><small>Photos and inspection context</small></span>
            </div>
            <div className="ch-journey-hero__float ch-journey-hero__float--bottom" aria-hidden="true">
              <span className="ch-journey-hero__float-icon"><WalletCards /></span>
              <span><strong>Reserve for free.</strong><small>Pay the landlord directly</small></span>
            </div>
          </div>
        </div>
      </section>

      <section className="ch-journey-intro" aria-labelledby="journey-heading">
        <div className="ch-journey-intro__inner">
          <div>
            <p className="ch-journey-eyebrow ch-journey-eyebrow--dark">The full journey</p>
            <h2 id="journey-heading">See every step, before you start.</h2>
          </div>
          <p>
            Select a moment to see the product at that stage. The screens are illustrative, while the rules are real:
            view and message before reserving, reserve for free, then let the landlord confirm after you agree terms.
          </p>
        </div>
      </section>

      <JourneyShowcase />

      <section className="ch-journey-truth" aria-labelledby="truth-heading">
        <div className="ch-journey-truth__inner">
          <div className="ch-journey-truth__heading">
            <p className="ch-journey-eyebrow ch-journey-eyebrow--dark">Good to know</p>
            <h2 id="truth-heading">Know the essentials before you begin.</h2>
          </div>
          <div className="ch-journey-truth__grid">
            <article>
              <span className="ch-journey-truth__icon"><Eye aria-hidden="true" /></span>
              <h3>View before you commit.</h3>
              <p>Contact the landlord and arrange a viewing before you reserve. Your questions belong in the decision.</p>
            </article>
            <article>
              <span className="ch-journey-truth__icon"><WalletCards aria-hidden="true" /></span>
              <h3>CampusHomes does not take rent.</h3>
              <p>Reservations are free. When you are ready, pay the landlord directly and keep the agreed terms close.</p>
            </article>
            <article>
              <span className="ch-journey-truth__icon"><ShieldCheck aria-hidden="true" /></span>
              <h3>Keep safety in the loop.</h3>
              <p>Use the safety guidance and contact the CampusHomes team when something about a listing or move-in does not match.</p>
            </article>
          </div>
        </div>
      </section>

      <section className="ch-journey-final" aria-labelledby="journey-final-heading">
        <div className="ch-journey-final__inner">
          <div>
            <p className="ch-journey-eyebrow">Your next step</p>
            <h2 id="journey-final-heading">Ready to find a room near campus?</h2>
            <p>Start with the search, or ask us a question before you begin.</p>
          </div>
          <div className="ch-journey-final__actions">
            <Link href="/search" className="ch-journey-button ch-journey-button--primary">
              Search hostels <ArrowRight aria-hidden="true" />
            </Link>
            <Link href="/safety" className="ch-journey-button ch-journey-button--outline">
              Read safety guidance
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
}
