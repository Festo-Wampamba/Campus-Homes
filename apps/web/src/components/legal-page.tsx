import type { ReactNode } from "react";

export function LegalPage({ title, updated, children }: { title: string; updated: string; children: ReactNode }) {
  return (
    <article className="mx-auto w-full max-w-3xl px-4 py-14 sm:px-6 sm:py-20">
      <h1 className="text-3xl tracking-[-0.035em] sm:text-4xl">{title}</h1>
      <p className="mt-3 text-sm text-muted-foreground">Last updated {updated}</p>
      <div className="mt-10 space-y-4 text-base leading-7 text-foreground [&_a]:font-semibold [&_a]:text-teal-700 [&_a]:underline [&_a]:underline-offset-4 [&_h2]:mt-10 [&_h2]:scroll-mt-24 [&_h2]:text-xl [&_h2]:font-semibold [&_li]:ml-5 [&_li]:list-disc [&_ul]:space-y-2">
        {children}
      </div>
    </article>
  );
}
