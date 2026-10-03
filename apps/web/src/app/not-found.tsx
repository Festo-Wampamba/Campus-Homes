import Link from "next/link";

import { Wordmark } from "@/components/shell/wordmark";

export const metadata = { title: "Page not found" };

export default function NotFound() {
  return (
    <main className="mx-auto flex w-full max-w-xl flex-1 flex-col justify-center px-4 py-20">
      <Link href="/" aria-label="CampusHomes home" className="mb-10 w-fit">
        <Wordmark className="text-xl" />
      </Link>
      <p className="text-sm font-bold text-teal-700">404</p>
      <h1 className="mt-2 text-3xl tracking-[-0.035em] sm:text-4xl">This page doesn&apos;t exist</h1>
      <p className="mt-4 text-base leading-7 text-muted-foreground">
        The link may be old, or the listing may have been removed. You can search current hostels
        instead.
      </p>
      <div className="mt-8 flex flex-wrap items-center gap-5">
        <Link
          href="/search"
          className="inline-flex h-12 items-center rounded-lg bg-teal-900 px-6 font-bold text-white transition-colors hover:bg-teal-700"
        >
          Search hostels
        </Link>
        <Link href="/" className="text-link">
          Go to the homepage
        </Link>
      </div>
    </main>
  );
}
