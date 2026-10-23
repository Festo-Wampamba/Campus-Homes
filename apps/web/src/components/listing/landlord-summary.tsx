import Link from "next/link";
import type { ListingDetailResponse } from "@campushomes/shared";
import { CalendarDays, CircleHelp, Clock3, MessageSquare, ShieldCheck, Star, UserRound } from "lucide-react";

import { Stars } from "@/components/chat/rate-landlord";

export function LandlordSummary({ landlord }: { landlord: ListingDetailResponse["landlord"] }) {
  const joined = landlord?.joinedAt ? new Date(landlord.joinedAt) : null;
  const validJoined = joined && Number.isFinite(joined.getTime());
  return <section aria-label="About the landlord" className="overflow-hidden rounded-2xl border border-border bg-card">
    <div className="p-5">
      <div className="mb-4 flex items-center gap-3">
        <span className="grid size-12 shrink-0 place-items-center rounded-full bg-muted text-primary"><UserRound aria-hidden className="size-6" /></span>
        <div className="min-w-0"><h2 className="text-base font-semibold [overflow-wrap:anywhere]">{landlord?.displayName || "Property landlord"}</h2><p className="text-sm text-muted-foreground">Your hostel contact</p></div>
      </div>
      <ul className="space-y-3 text-sm">
        <li className="flex items-start gap-2"><CalendarDays aria-hidden className="size-5 shrink-0 text-primary" /><span>{validJoined ? `On CampusHomes since ${joined.toLocaleDateString("en-UG", { month: "long", year: "numeric", timeZone: "UTC" })}` : "Join date not available"}</span></li>
        <li className="flex items-start gap-2"><Clock3 aria-hidden className="size-5 shrink-0 text-primary" /><span>{landlord?.within24HoursRate != null ? `${landlord.within24HoursRate}% answered within 24 hours` : "Reply speed not established yet"}</span></li>
        <li className="flex items-start gap-2"><MessageSquare aria-hidden className="size-5 shrink-0 text-primary" /><span>{landlord?.responseRate != null ? `${landlord.responseRate}% of inquiries answered` : "Reply rate not established yet"}</span></li>
        <li className="flex items-start gap-2"><Star aria-hidden className="size-5 shrink-0 text-primary" />{landlord?.ratingCount && landlord.ratingAverage != null ? <span className="flex flex-wrap items-center gap-x-2"><Stars value={landlord.ratingAverage} />{landlord.ratingAverage} from {landlord.ratingCount} student {landlord.ratingCount === 1 ? "rating" : "ratings"}</span> : <span>No student ratings yet</span>}</li>
      </ul>
      {!!landlord?.recentRatings?.length && <ul aria-label="Recent student comments" className="mt-4 space-y-3 border-t border-border pt-4 text-sm">
        {landlord.recentRatings.map((r) => <li key={r.createdAt}><Stars value={r.rating} /><p className="mt-1 text-muted-foreground [overflow-wrap:anywhere]">“{r.comment}”</p></li>)}
      </ul>}
      <details className="mt-3 text-sm text-muted-foreground">
        <summary className="flex min-h-11 cursor-pointer items-center gap-2 font-semibold text-primary"><CircleHelp aria-hidden className="size-4" />About reply statistics</summary>
        <p className="mt-2 leading-relaxed">Based on listing inquiries received 1–90 days ago, with at least five inquiries needed. Timings use the recorded reply, including edits. Past replies don’t guarantee a response time. A viewing is confirmed only after the landlord agrees.</p>
      </details>
    </div>
    <Link href="/safety" className="flex min-h-12 items-center gap-2 border-t border-border bg-muted px-5 py-3 text-sm font-semibold text-primary"><ShieldCheck aria-hidden className="size-5 shrink-0" />Property inspected in person</Link>
  </section>;
}
