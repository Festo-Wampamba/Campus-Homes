import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowRight, BookOpen, CircleHelp, ShieldCheck } from "lucide-react";
import { SupportTabs } from "@/components/support/support-tabs";

import "./support.css";

export const metadata: Metadata = {
  title: "Support",
  description: "Ask CampusHomes AI or read the guide to finding and reserving a room. Contact our team on the Contact Us page.",
  alternates: { canonical: "/support" },
};

export default async function SupportPage({ searchParams }: { searchParams: Promise<{ tab?: string; listingId?: string; subject?: string }> }) {
  const { tab, listingId, subject } = await searchParams;
  // Old bookmarks and report links retain their context at the dedicated page.
  if (tab === "contact" || listingId) {
    const query = new URLSearchParams();
    if (listingId) query.set("listingId", listingId);
    if (subject) query.set("subject", subject);
    redirect(`/contact${query.size ? `?${query}` : ""}`);
  }
  return (
    <div className="ch-public-page ch-support-page">
      <section className="ch-support-hero" aria-labelledby="support-heading">
        <Image src="/images/campushomes/student-lounge-hd-v2.webp" alt="" fill priority sizes="100vw" className="ch-support-hero__image" />
        <div className="ch-support-hero__inner">
          <p className="ch-support-eyebrow">CampusHomes support</p>
          <h1 id="support-heading">Help when you need it.</h1>
          <p className="ch-support-hero__description">Ask CampusHomes AI or follow the user manual. For help with your account, a booking or a safety concern, <Link href="/contact">talk to our team</Link>.</p>
        </div>
      </section>

      <div className="ch-support-layout">
        <aside className="ch-support-resources" aria-labelledby="support-resources-heading">
          <p className="ch-support-eyebrow ch-support-eyebrow--muted">A useful place to start</p>
          <h2 id="support-resources-heading">Helpful guides</h2>
          <nav aria-label="Support resources">
            <Link href="/how-it-works"><BookOpen aria-hidden /><span><strong>How it works</strong><small>From your first search to move-in.</small></span><ArrowRight aria-hidden /></Link>
            <Link href="/faqs"><CircleHelp aria-hidden /><span><strong>Common questions</strong><small>Quick answers about finding a room.</small></span><ArrowRight aria-hidden /></Link>
            <Link href="/safety"><ShieldCheck aria-hidden /><span><strong>Inspection and safety</strong><small>Know what to check before deciding.</small></span><ArrowRight aria-hidden /></Link>
          </nav>
          <p className="ch-support-resources__note">CampusHomes AI gives general guidance. Our team can help with questions about your specific account or reservation.</p>
        </aside>
        <div className="ch-support-workspace">
          <SupportTabs initialTab={tab === "manual" ? "manual" : "ai"} />
        </div>
      </div>
    </div>
  );
}
