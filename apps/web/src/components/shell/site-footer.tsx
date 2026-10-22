import Link from "next/link";

import { CAMPUSHOMES_CONTACT } from "@/lib/contact-details";
import { ENABLED_CAMPUSES } from "@/lib/campuses";
import { Wordmark } from "@/components/shell/wordmark";

const CAMPUSES = ENABLED_CAMPUSES;

const PRODUCT_LINKS = [
  { href: "/search", label: "Find a room" },
  { href: "/how-it-works", label: "How it works" },
  { href: "/safety", label: "Inspection and safety" },
  { href: "/faqs", label: "FAQs" },
  { href: "/support", label: "Support" },
  { href: "/contact", label: "Contact Us" },
  { href: "/sign-in", label: "Student sign in" },
];

function SiteFooter() {
  return (
    <footer className="mt-auto bg-teal-900 text-white">
      <div className="mx-auto w-full max-w-7xl px-4 pt-16 pb-8 sm:px-6 lg:px-8 lg:pt-20">
        <div className="grid gap-12 border-b border-white/10 pb-14 md:grid-cols-[1.35fr_0.65fr_1fr_0.8fr]">
          <div className="max-w-sm">
            <Wordmark onDark className="max-w-full flex-wrap text-2xl sm:text-3xl" />
            <p className="mt-5 text-sm leading-6 text-white/80">
              Student hostels near Uganda&apos;s universities, each inspected in
              person before it is listed. Reserving a room is free.
            </p>
          </div>

          <nav aria-label="Explore CampusHomes">
            <p className="font-display text-sm font-semibold text-white">Explore</p>
            <ul className="mt-4 space-y-3 text-sm text-white/80">
              {PRODUCT_LINKS.map((link) => (
                <li key={link.href}>
                  <Link href={link.href} className="inline-flex min-h-11 items-center transition-colors duration-150 hover:text-white">
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>

          <nav aria-label="Housing near universities">
            <p className="font-display text-sm font-semibold text-white">Housing near</p>
            <ul className="mt-4 space-y-3 text-sm text-white/80">
              {CAMPUSES.map((campus) => (
                <li key={campus.code}>
                  <Link
                    href={`/search?campus=${campus.code}`}
                    className="inline-flex min-h-11 items-center transition-colors duration-150 hover:text-white"
                  >
                    {campus.name}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>

          <div>
            <p className="font-display text-sm font-semibold text-white">Contact</p>
            <ul className="mt-4 space-y-3 text-sm text-white/80">
              <li>{CAMPUSHOMES_CONTACT.office}<br />{CAMPUSHOMES_CONTACT.locality}</li>
              <li>
                <a
                  href={`mailto:${CAMPUSHOMES_CONTACT.email}`}
                  className="inline-flex min-h-11 items-center transition-colors duration-150 hover:text-white"
                >
                  {CAMPUSHOMES_CONTACT.email}
                </a>
              </li>
              {CAMPUSHOMES_CONTACT.officePhone && (
                <li>
                  <a
                    href={`tel:${CAMPUSHOMES_CONTACT.officePhone}`}
                    className="inline-flex min-h-11 items-center transition-colors duration-150 hover:text-white"
                  >
                    {CAMPUSHOMES_CONTACT.officePhoneLabel}
                  </a>
                </li>
              )}
              <li>
                <Link href="/landlords" className="inline-flex min-h-11 items-center transition-colors duration-150 hover:text-white">
                  List your hostel
                </Link>
              </li>
            </ul>
          </div>
        </div>

        <div className="flex flex-col gap-3 pt-6 text-xs text-white/70 sm:flex-row sm:items-center sm:justify-between">
          <p>© {new Date().getFullYear()} CampusHomes Uganda. All rights reserved. <a href={CAMPUSHOMES_CONTACT.developerHref} target="_blank" rel="noopener noreferrer" className="underline underline-offset-4">Developed by Akolet</a>.</p>
          <nav aria-label="Legal" className="flex flex-wrap gap-5">
            <Link href="/privacy" className="inline-flex min-h-11 items-center transition-colors duration-150 hover:text-white">Privacy policy</Link>
            <Link href="/terms" className="inline-flex min-h-11 items-center transition-colors duration-150 hover:text-white">Terms and conditions</Link>
          </nav>
        </div>
      </div>
    </footer>
  );
}

export { SiteFooter };
