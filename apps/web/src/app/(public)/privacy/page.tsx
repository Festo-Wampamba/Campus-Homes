import type { Metadata } from "next";
import Link from "next/link";

import { LegalPage } from "@/components/legal-page";
import { getSupportEmail } from "@/lib/support-contact";

export const metadata: Metadata = {
  title: "Privacy policy",
  description: "What personal data CampusHomes collects, why, who it is shared with, and your rights under Uganda's Data Protection and Privacy Act.",
  alternates: { canonical: "/privacy" },
};

export default async function PrivacyPage() {
  const email = await getSupportEmail();
  return (
    <LegalPage title="Privacy policy" updated="29 September 2026">
      <p>
        CampusHomes helps students find inspected hostels near their university and helps landlords list
        them. This policy explains what personal data we collect, why, and what you can ask us to do with
        it. It applies to campushomes.co.ug and the CampusHomes student, landlord and staff portals.
      </p>
      <p>
        We process personal data in line with the Data Protection and Privacy Act, 2019 of Uganda. For any
        privacy question or request, email <a href={`mailto:${email}`}>{email}</a>.
      </p>

      <h2 id="what-we-collect">What we collect</h2>
      <ul>
        <li><strong>Account details:</strong> your phone number or email address, and your name. If you sign in with Google, we receive your name and email from Google.</li>
        <li><strong>Student profile:</strong> your university and year of study, plus any details you choose to add to your profile, such as date of birth, gender, nationality, address and an emergency contact.</li>
        <li><strong>Landlord verification:</strong> your legal name, an identity document, property details, property documents and photos.</li>
        <li><strong>Activity on the platform:</strong> reservations, saved listings, messages with landlords, enquiries and support requests, reviews, calendar entries and signed tenant agreements.</li>
        <li><strong>Usage data:</strong> which pages are visited and which main buttons are clicked. We record only the page address (never search text or other query details), and these records are not linked to your account.</li>
        <li><strong>Technical data:</strong> server logs that include IP addresses, kept for security and troubleshooting.</li>
      </ul>
      <p>We do not collect card or mobile-money details. Rent and deposits are paid directly to the landlord, outside CampusHomes.</p>

      <h2 id="why">Why we use it</h2>
      <ul>
        <li>To create and secure your account and sign you in.</li>
        <li>To show listings, hold reservations and connect students with landlords.</li>
        <li>To verify landlords and inspect properties before they are published.</li>
        <li>To answer support requests and investigate safety reports.</li>
        <li>To understand how the site is used so we can improve it.</li>
        <li>To prevent spam, fraud and abuse, and to meet legal obligations.</li>
      </ul>

      <h2 id="sharing">Who we share it with</h2>
      <p>We do not sell personal data. We share it only as needed to run the service:</p>
      <ul>
        <li><strong>Landlords</strong> see the reservation and messages you send about their property.</li>
        <li><strong>Service providers</strong> that process data for us: Africa&apos;s Talking (SMS sign-in codes), Resend (email), Backblaze and Cloudinary (photo and document storage), Google (only if you choose Google sign-in), and Cloudflare (network security).</li>
        <li><strong>Map tiles</strong> are loaded from OpenStreetMap servers, which receive your IP address when a map is displayed.</li>
        <li><strong>Authorities</strong>, when the law requires it.</li>
      </ul>
      <p>Some of these providers store data outside Uganda. We use them only under terms that protect the data.</p>

      <h2 id="cookies">Cookies and local storage</h2>
      <p>We use only essential cookies:</p>
      <ul>
        <li><strong>Session cookies</strong> (<code>campushomes-session</code>, <code>campushomes-auth</code>, <code>campushomes-signin-*</code>) keep you signed in and protect the sign-in process.</li>
      </ul>
      <p>
        Your browser&apos;s local storage also keeps your theme choice, your recently viewed listings and
        whether you have dismissed the cookie notice. These stay on your device. We do not use advertising or
        third-party tracking cookies, and our usage statistics do not use cookies.
      </p>

      <h2 id="retention">How long we keep it</h2>
      <p>
        We keep account data while your account is active. When an account is deleted, we remove or anonymise
        its personal data unless we must keep a record for legal, safety or dispute reasons. Server logs and
        usage records are kept only as long as they are useful for security and reporting.
      </p>

      <h2 id="rights">Your rights</h2>
      <p>You can ask us to:</p>
      <ul>
        <li>give you a copy of the personal data we hold about you;</li>
        <li>correct data that is wrong;</li>
        <li>delete your data or account;</li>
        <li>stop using your data for a particular purpose.</li>
      </ul>
      <p>
        Email <a href={`mailto:${email}`}>{email}</a> and we will reply within 30 days. You can also complain
        to Uganda&apos;s Personal Data Protection Office.
      </p>

      <h2 id="security">Security</h2>
      <p>
        Data is sent over HTTPS, access inside CampusHomes is limited by role, and database rules stop one
        user&apos;s records from being read by another. No system is perfectly secure, so please tell us at once
        if you think your account has been misused.
      </p>

      <h2 id="changes">Changes to this policy</h2>
      <p>
        We will update the date at the top when this policy changes, and tell signed-in users about major
        changes. See also our <Link href="/terms">Terms and conditions</Link>.
      </p>
    </LegalPage>
  );
}
