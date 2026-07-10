import Link from "next/link";

import { Wordmark } from "@/components/shell/wordmark";

function SiteFooter() {
  return (
    <footer className="mt-auto bg-teal-900 text-white">
      <div className="mx-auto grid w-full max-w-6xl gap-10 px-4 py-12 sm:grid-cols-[1fr_auto_auto] sm:gap-16 sm:px-6">
        <div className="max-w-xs space-y-3">
          <Wordmark onDark />
          <p className="text-sm leading-relaxed text-white/70">
            Verified student housing near Ugandan universities. Live, Learn,
            Succeed.
          </p>
        </div>
        <nav aria-label="Footer" className="space-y-2.5 text-sm">
          <p className="font-display font-semibold">Explore</p>
          <ul className="space-y-2 text-white/70">
            <li>
              <Link href="/search" className="transition-colors hover:text-white">
                Find housing
              </Link>
            </li>
            <li>
              <Link href="/#how-it-works" className="transition-colors hover:text-white">
                How it works
              </Link>
            </li>
            <li>
              <Link href="/#landlords" className="transition-colors hover:text-white">
                For landlords
              </Link>
            </li>
          </ul>
        </nav>
        <div className="space-y-2.5 text-sm">
          <p className="font-display font-semibold">Contact</p>
          <ul className="space-y-2 text-white/70">
            <li>Kampala, Uganda</li>
            <li>
              <a
                href="mailto:hello@campushomes.ug"
                className="transition-colors hover:text-white"
              >
                hello@campushomes.ug
              </a>
            </li>
          </ul>
        </div>
      </div>
      <div className="border-t border-white/10">
        <p className="mx-auto w-full max-w-6xl px-4 py-4 text-xs text-white/70 sm:px-6">
          © {new Date().getFullYear()} CampusHomes Uganda
        </p>
      </div>
    </footer>
  );
}

export { SiteFooter };
