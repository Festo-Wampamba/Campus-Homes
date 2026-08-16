import Link from "next/link";
import Image from "next/image";

import { api } from "@/lib/api";
import { CAMPUS_LOCATIONS } from "@/lib/campuses";

const CAMPUSES = Object.values(CAMPUS_LOCATIONS);

const PRODUCT_LINKS = [
  { href: "/search", label: "Find a room" },
  { href: "/#how-it-works", label: "How it works" },
  { href: "/#verified", label: "How we verify" },
  { href: "/sign-in", label: "Student sign in" },
];

async function SiteFooter() {
  // Admin-configured (Platform settings → Support contact), not hardcoded —
  // falls back to the same default the backend itself uses if the fetch
  // fails, so the footer never renders with no contact route at all.
  const support = await api<{ email: string; phone: string }>("/listings/support-contact").catch(
    () => ({ email: "hello@campushomes.ug", phone: "" }),
  );
  return (
    <footer className="mt-auto bg-teal-900 text-white">
      <div className="mx-auto w-full max-w-7xl px-4 pt-16 pb-8 sm:px-6 lg:px-8 lg:pt-20">
        <div className="grid gap-12 border-b border-white/10 pb-14 md:grid-cols-[1.35fr_0.65fr_1fr_0.8fr]">
          <div className="max-w-sm">
            <Image
              src="/images/branding/campushomes-brandmark.webp"
              alt="CampusHomes — Live, Learn, Succeed"
              width={180}
              height={172}
              className="h-24 w-auto object-contain object-left sm:h-28"
              priority={false}
            />
            <p className="mt-5 text-sm leading-6 text-white/62">
              Physically verified student housing near Uganda&apos;s universities.
              Search clearly, reserve a room for free, and move in knowing what
              is actually there.
            </p>
            <p className="mt-6 inline-flex rounded-full border border-white/12 bg-white/6 px-3 py-1.5 text-xs font-semibold text-white/70">
              Built in Kampala for Ugandan students
            </p>
          </div>

          <nav aria-label="Explore CampusHomes">
            <p className="font-display text-sm font-semibold text-white">Explore</p>
            <ul className="mt-4 space-y-3 text-sm text-white/58">
              {PRODUCT_LINKS.map((link) => (
                <li key={link.href}>
                  <Link href={link.href} className="transition-colors duration-300 hover:text-white">
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>

          <nav aria-label="Housing near universities">
            <p className="font-display text-sm font-semibold text-white">Housing near</p>
            <ul className="mt-4 space-y-3 text-sm text-white/58">
              {CAMPUSES.map((campus) => (
                <li key={campus.code}>
                  <Link
                    href={`/search?campus=${campus.code}`}
                    className="transition-colors duration-300 hover:text-white"
                  >
                    {campus.name}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>

          <div>
            <p className="font-display text-sm font-semibold text-white">Contact</p>
            <ul className="mt-4 space-y-3 text-sm text-white/58">
              <li>Kampala, Uganda</li>
              <li>
                <a
                  href={`mailto:${support.email}`}
                  className="transition-colors duration-300 hover:text-white"
                >
                  {support.email}
                </a>
              </li>
              {support.phone && (
                <li>
                  <a
                    href={`tel:${support.phone}`}
                    className="transition-colors duration-300 hover:text-white"
                  >
                    {support.phone}
                  </a>
                </li>
              )}
              <li>
                <Link href="/#landlords" className="transition-colors duration-300 hover:text-white">
                  List your hostel
                </Link>
              </li>
            </ul>
          </div>
        </div>

        <div className="flex flex-col gap-3 pt-6 text-xs text-white/42 sm:flex-row sm:items-center sm:justify-between">
          <p>© {new Date().getFullYear()} CampusHomes Uganda. All rights reserved.</p>
          <p>Live, Learn, Succeed.</p>
        </div>
      </div>
    </footer>
  );
}

export { SiteFooter };
