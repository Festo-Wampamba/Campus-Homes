import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRightIcon, QuestionMarkCircledIcon } from "@radix-ui/react-icons";
import { FaqTopics } from "./faq-topics";

export const metadata: Metadata = {
  title: "FAQs",
  description: "Answers about inspected hostels, free reservations, room availability and support on CampusHomes.",
  alternates: { canonical: "/faqs" },
};

export default function FaqsPage() {
  return (
    <div className="ch-public-page">
      <section className="ch-public-page__hero ch-public-page__hero--dark">
        <div className="mx-auto w-full max-w-5xl">
          <p className="ch-eyebrow text-coral-500">Help before you search</p>
          <h1>Questions students ask before reserving</h1>
          <p className="text-white/78">Clear answers about what CampusHomes checks, how room holds work and where rent is paid.</p>
        </div>
      </section>
      <div className="ch-public-content ch-public-content--narrow">
        <div className="mb-9 flex items-start gap-4 rounded-2xl border border-teal-100 bg-teal-50 p-5">
          <QuestionMarkCircledIcon aria-hidden className="mt-1 size-5 shrink-0 text-teal-700" />
          <p className="text-sm leading-6 text-teal-950">
            If an answer depends on a specific hostel, open its listing or ask the landlord before you travel.
          </p>
        </div>
        <FaqTopics />
        <div className="mt-10 flex flex-wrap gap-5">
          <Link href="/search?campus=MUK" className="inline-flex min-h-11 items-center gap-2 rounded-full bg-teal-900 px-5 text-sm font-bold text-white hover:bg-teal-700">
            Find a room <ArrowRightIcon aria-hidden />
          </Link>
          <Link href="/support" className="inline-flex min-h-11 items-center gap-2 font-bold text-teal-700 underline-offset-4 hover:underline">
            Contact support <ArrowRightIcon aria-hidden />
          </Link>
        </div>
      </div>
    </div>
  );
}
