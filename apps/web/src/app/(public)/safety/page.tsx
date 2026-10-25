import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, ShieldAlert, TriangleAlert } from "lucide-react";

import "./safety.css";

export const metadata: Metadata = {
  title: "Safety and verification",
  description: "How CampusHomes inspects hostels and what students can do to make a safe housing decision.",
  alternates: { canonical: "/safety" },
};

const INSPECTION_CHECKS = [
  { title: "Location", body: "The property address and location are checked on site." },
  { title: "Rooms", body: "Room types, capacity and room details are recorded during the visit." },
  { title: "Amenities", body: "Amenities and shared facilities are recorded from the inspection visit." },
  { title: "Photos", body: "Published photos are tied to the property or room type they show." },
  { title: "Landlord identity", body: "The landlord or property manager is identified before publication." },
  { title: "Safety", body: "Locks, lighting and exits are reviewed as part of the safety check." },
] as const;

const RED_FLAGS = [
  "Pressure to pay before you have viewed the property or agreed written terms.",
  "A room, price, photo or landlord detail that does not match what you see or were told.",
  "A request for passwords, one-time codes or private information that the housing conversation does not need.",
  "Pressure to skip questions, skip a viewing or ignore the written tenancy terms.",
] as const;

export default function SafetyPage() {
  return (
    <div className="ch-public-page ch-safety-page">
      <section className="ch-safety-hero" aria-labelledby="safety-hero-heading">
        <div className="ch-safety-hero__inner">
          <p className="ch-safety-eyebrow">Safety and verification</p>
          <h1 id="safety-hero-heading">Make your next housing decision with the facts in view</h1>
          <p>
            CampusHomes records what our team sees during an inspection so you can visit, ask questions and decide carefully.
          </p>
        </div>
      </section>

      <div className="ch-safety-content">
        <section className="ch-safety-intro" aria-labelledby="verified-heading">
          <div className="ch-safety-intro__copy">
            <p className="ch-safety-eyebrow ch-safety-eyebrow--dark">What Verified means</p>
            <h2 id="verified-heading">A visit by our team, recorded with a date.</h2>
            <p>
              A Verified badge means an inspector visited the property and completed the checks below before the listing was published. It describes that inspection; it is not a promise about future conduct or changes made later.
            </p>
          </div>

          <section className="ch-safety-checks" aria-labelledby="checks-heading">
            <p id="checks-heading" className="ch-safety-eyebrow ch-safety-eyebrow--dark">Our inspection checks</p>
            <div className="ch-safety-check-grid">
              {INSPECTION_CHECKS.map((check, index) => (
                <article key={check.title} className="ch-safety-check">
                  <span className="ch-safety-check__number" aria-hidden>{String(index + 1).padStart(2, "0")}</span>
                  <div>
                    <h3>{check.title}</h3>
                    <p>{check.body}</p>
                  </div>
                </article>
              ))}
            </div>
          </section>
        </section>

        <section className="ch-safety-guidance" aria-labelledby="guidance-heading">
          <article className="ch-safety-card ch-safety-card--teal">
            <ShieldAlert aria-hidden className="ch-safety-card__icon" />
            <h2 id="guidance-heading">Before you pay or move in</h2>
            <ul>
              <li>Visit the property and confirm the room, facilities and terms yourself.</li>
              <li>Ask the landlord to explain rent, deposit, house rules and extra charges in writing.</li>
              <li>Share private information only when it is needed with a contact you trust.</li>
              <li>Keep your CampusHomes reservation and message references if you need support.</li>
            </ul>
            <p className="ch-safety-card__note">
              CampusHomes reservations are free; when an available bed is held, no payment is taken on CampusHomes. Rent and deposits are paid directly to the landlord after you agree written tenancy terms.
            </p>
          </article>

          <article className="ch-safety-card ch-safety-card--warning" aria-labelledby="red-flags-heading">
            <TriangleAlert aria-hidden className="ch-safety-card__icon" />
            <h2 id="red-flags-heading">Pause on these red flags</h2>
            <ul>
              {RED_FLAGS.map((flag) => <li key={flag}>{flag}</li>)}
            </ul>
            <p className="ch-safety-card__note">
              If something feels wrong, pause and leave if you feel unsafe. Keep the hostel name and a reservation or message reference when you have one, then contact our team.
            </p>
            <Link href="/contact" className="ch-safety-card__action">
              Report a concern <ArrowRight aria-hidden />
            </Link>
          </article>
        </section>

        <section className="ch-safety-next" aria-labelledby="next-heading">
          <div>
            <p className="ch-safety-eyebrow ch-safety-eyebrow--dark">Need a hand?</p>
            <h2 id="next-heading">Keep asking questions until the details are clear.</h2>
            <p>Browse inspected hostels, or contact CampusHomes support when you need help with a listing or reservation.</p>
          </div>
          <div className="ch-safety-next__links">
            <Link href="/search?campus=MUK" className="ch-safety-link">Browse inspected hostels <ArrowRight aria-hidden /></Link>
            <Link href="/contact" className="ch-safety-link">Contact support <ArrowRight aria-hidden /></Link>
          </div>
        </section>
      </div>
    </div>
  );
}
