import Link from "next/link";
import { ArrowRight, Shield } from "lucide-react";

const TIPS = [
  {
    title: "Inspect before paying",
    body: "Visit the property, confirm who you are dealing with and agree written tenancy terms before paying rent or a deposit.",
  },
  {
    title: "Check the inspection date",
    body: "The date records when our team visited. Rooms and conditions can change, so view the property and ask questions before deciding.",
  },
  {
    title: "Keep your details and references private",
    body: "Share private information only when it is needed with a contact you trust. Keep your CampusHomes reservation and message references for support.",
  },
] as const;

export function InquirySafetyTips({reportHref = "/contact"}: {reportHref?: string}) {
  return (
    <aside className="rounded-2xl border border-border bg-muted p-5 text-foreground sm:p-6" aria-labelledby="inquiry-safety-tips-heading">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border pb-4">
        <h2 id="inquiry-safety-tips-heading" className="flex items-center gap-3 text-xl"><Shield aria-hidden className="size-5 shrink-0 text-primary"/>Inquiry safety tips</h2>
        <Link href="/safety" className="inline-flex min-h-11 items-center gap-2 text-sm font-semibold text-primary underline-offset-4 hover:underline">Find out more <ArrowRight aria-hidden className="size-4"/></Link>
      </div>
      <ol className="mt-4 list-decimal space-y-4 pl-5 text-sm leading-6 marker:font-semibold">
        {TIPS.map(tip=><li key={tip.title}><strong>{tip.title}.</strong> <span className="text-muted-foreground">{tip.body}</span></li>)}
      </ol>
      <Link href={reportHref} className="mt-4 inline-flex min-h-11 items-center gap-2 text-sm font-semibold text-primary underline-offset-4 hover:underline">Report a concern <ArrowRight aria-hidden className="size-4"/></Link>
    </aside>
  );
}
