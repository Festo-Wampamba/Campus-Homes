import type { Metadata } from "next";
import Link from "next/link";

import { LegalPage } from "@/components/legal-page";
import { getSupportEmail } from "@/lib/support-contact";

export const metadata: Metadata = {
  title: "Terms and conditions",
  description: "The rules for using CampusHomes as a student or landlord: reservations, verification, conduct and liability.",
  alternates: { canonical: "/terms" },
};

export default async function TermsPage() {
  const email = await getSupportEmail();
  return (
    <LegalPage title="Terms and conditions" updated="29 September 2026">
      <p>
        These terms apply when you use campushomes.co.ug or any CampusHomes portal. By creating an account or
        making a reservation you agree to them. If you do not agree, please do not use the service.
      </p>

      <h2 id="what-we-do">What CampusHomes does</h2>
      <p>
        CampusHomes lists student hostels, inspects them before publication and lets students reserve a room.
        We are not the landlord and we are not a party to your tenancy. Your rental agreement, rent, deposit
        and house rules are between you and the landlord.
      </p>

      <h2 id="accounts">Accounts</h2>
      <ul>
        <li>You must give accurate details and keep your sign-in method secure.</li>
        <li>One person may hold one account. Do not sign in as someone else.</li>
        <li>We may suspend or close an account that breaks these terms or puts other users at risk.</li>
      </ul>

      <h2 id="reservations">Reservations</h2>
      <ul>
        <li>Reserving a room on CampusHomes is free.</li>
        <li>A reservation holds a bed for you while you arrange the rest with the landlord. It is not a tenancy.</li>
        <li>You can hold up to three active reservations and cancel any of them from your account.</li>
        <li>The landlord confirms the booking and collects rent directly. CampusHomes does not collect or mark up rent.</li>
      </ul>

      <h2 id="verification">What &quot;Verified&quot; means</h2>
      <p>
        A Verified badge means a CampusHomes inspector visited the property and checked its location, rooms,
        amenities, photos, landlord identity and safety on the inspection date. It is not a guarantee about the
        landlord&apos;s conduct or about changes made after the inspection. If a listing does not match what you
        find, <Link href="/support">report it</Link> and we will investigate.
      </p>

      <h2 id="landlords">Landlord responsibilities</h2>
      <ul>
        <li>Listing details, prices and availability must be accurate and kept up to date.</li>
        <li>You must have the right to let the property and must meet the laws that apply to it.</li>
        <li>You must treat students fairly and respond to reservations and messages promptly.</li>
        <li>Repeated or serious problems can lead to strikes, suspension of your listings, or removal.</li>
      </ul>

      <h2 id="conduct">Acceptable use</h2>
      <p>Do not use CampusHomes to:</p>
      <ul>
        <li>post false, misleading or offensive content;</li>
        <li>share phone numbers or links in messages to move a deal off the platform before a reservation;</li>
        <li>send spam, scrape the site, or try to break or overload it;</li>
        <li>harass, threaten or defraud anyone.</li>
      </ul>

      <h2 id="content">Your content</h2>
      <p>
        You keep ownership of photos, reviews and messages you post. You allow CampusHomes to display them on the
        service for as long as they are published. We may remove content that breaks these terms.
      </p>

      <h2 id="liability">Liability</h2>
      <p>
        We work to keep listings accurate, but we cannot guarantee that a property or landlord will meet your
        expectations. To the extent the law allows, CampusHomes is not liable for losses arising from a tenancy
        between a student and a landlord. Nothing in these terms limits rights you have under Ugandan consumer
        law.
      </p>

      <h2 id="changes">Changes and governing law</h2>
      <p>
        We may update these terms and will change the date above when we do. Continuing to use CampusHomes after
        a change means you accept it. These terms are governed by the laws of Uganda.
      </p>

      <h2 id="contact">Contact</h2>
      <p>
        Questions about these terms: <a href={`mailto:${email}`}>{email}</a>. How we handle personal data is
        explained in our <Link href="/privacy">Privacy policy</Link>.
      </p>
    </LegalPage>
  );
}
