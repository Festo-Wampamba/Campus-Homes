import Link from "next/link";
import type { LandlordTenant } from "@campushomes/shared";

import { DownloadTenantsCsv } from "@/components/landlord/download-tenants-csv";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { formatUgx } from "@/lib/format";
import { percent, type IncomeFigures, type PropertyIncome } from "@/lib/tenant-ledger";

const OWING_SHOWN = 5;

function Figure({ label, value, hint, tone }: { label: string; value: number; hint: string; tone?: "owed" }) {
  return (
    <div className="rounded-md border border-border p-3">
      <dt className="text-xs font-medium text-muted-foreground">{label}</dt>
      <dd className={`mt-1 text-lg font-bold tabular-nums ${tone === "owed" && value > 0 ? "text-destructive" : "text-foreground"}`}>
        {formatUgx(value)}
      </dd>
      <dd className="mt-0.5 text-xs text-muted-foreground">{hint}</dd>
    </div>
  );
}

/** Target split into collected / still owed / lost to empty beds, as one bar. */
function TargetBar({ total }: { total: IncomeFigures }) {
  const share = (value: number) => (total.targetUgx > 0 ? (value / total.targetUgx) * 100 : 0);
  const parts = [
    { label: "Collected", value: total.achievedUgx, className: "bg-teal-700" },
    { label: "Still owed", value: total.remainingUgx, className: "bg-coral-500" },
    { label: "Empty beds", value: total.emptyBedGapUgx, className: "bg-muted-foreground/30" },
  ];
  const summary = parts.map((p) => `${p.label} ${formatUgx(p.value)}`).join(", ");
  return (
    <div>
      <div role="img" aria-label={`Of a ${formatUgx(total.targetUgx)} target: ${summary}`} className="flex h-3 w-full overflow-hidden rounded-full bg-muted">
        {parts.map((p) => <div key={p.label} className={p.className} style={{ width: `${share(p.value)}%` }} />)}
      </div>
      <ul className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
        {parts.map((p) => (
          <li key={p.label} className="flex items-center gap-1.5">
            <span aria-hidden className={`size-2.5 rounded-full ${p.className}`} />
            {p.label} {Math.round(share(p.value))}%
          </li>
        ))}
      </ul>
    </div>
  );
}

/** This term's money for the landlord: what full rooms would bring, what
 * current students owe, what has been paid, and who still owes. */
export function IncomeProjection({ total, byProperty, tenants }: { total: IncomeFigures; byProperty: PropertyIncome[]; tenants: LandlordTenant[] }) {
  const collected = percent(total.achievedUgx, total.expectedUgx);
  const owing = tenants.filter((t) => t.balanceUgx > 0).sort((a, b) => b.balanceUgx - a.balanceUgx);

  return (
    <Card>
      <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-3">
        <div>
          <CardTitle>Income this term</CardTitle>
          <CardDescription>
            From your listed rents and the payments you&apos;ve recorded. Updates by itself as students book and pay.
          </CardDescription>
        </div>
        <DownloadTenantsCsv tenants={tenants} />
      </CardHeader>
      <div className="space-y-6 px-6 pb-6">
        <dl className="grid grid-cols-2 gap-3 lg:grid-cols-3 2xl:grid-cols-5">
          <Figure label="Target" value={total.targetUgx} hint="Every open bed let at its listed rent" />
          <Figure label="Expected" value={total.expectedUgx} hint="Rent from booked and moved-in students" />
          <Figure label="Achieved so far" value={total.achievedUgx} hint={collected === null ? "Recorded payments" : `${collected}% of expected collected`} />
          <Figure label="Remaining" value={total.remainingUgx} hint="Still to collect from current students" tone="owed" />
          <Figure label="Empty-bed gap" value={total.emptyBedGapUgx} hint="Target minus expected: fill these beds" />
        </dl>

        <TargetBar total={total} />

        {byProperty.length > 1 && (
          <div className="overflow-x-auto rounded-md border border-border">
            <table className="w-full min-w-[40rem] text-left text-sm">
              <caption className="sr-only">Income this term by property</caption>
              <thead className="border-b border-border bg-muted/50 text-xs font-semibold text-muted-foreground uppercase">
                <tr>
                  <th scope="col" className="px-3 py-2">Property</th>
                  <th scope="col" className="px-3 py-2 text-right">Target</th>
                  <th scope="col" className="px-3 py-2 text-right">Expected</th>
                  <th scope="col" className="px-3 py-2 text-right">Achieved</th>
                  <th scope="col" className="px-3 py-2 text-right">Remaining</th>
                  <th scope="col" className="px-3 py-2 text-right">Collected</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {byProperty.map((p) => {
                  const rate = percent(p.achievedUgx, p.expectedUgx);
                  return (
                    <tr key={p.propertyId}>
                      <th scope="row" className="px-3 py-2 font-semibold text-foreground">{p.propertyName}</th>
                      <td className="px-3 py-2 text-right tabular-nums">{formatUgx(p.targetUgx)}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{formatUgx(p.expectedUgx)}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{formatUgx(p.achievedUgx)}</td>
                      <td className={`px-3 py-2 text-right tabular-nums ${p.remainingUgx > 0 ? "text-destructive" : ""}`}>{formatUgx(p.remainingUgx)}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{rate === null ? "N/A" : `${rate}%`}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        <div>
          <h3 className="text-sm font-semibold text-foreground">Who still owes</h3>
          {owing.length === 0 ? (
            <p className="mt-2 text-sm text-muted-foreground">Nobody. Every current student has paid in full.</p>
          ) : (
            <>
              <ul className="mt-2 divide-y divide-border rounded-md border border-border">
                {owing.slice(0, OWING_SHOWN).map((t) => (
                  <li key={t.reservationId} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 text-sm">
                    <span>
                      <span className="font-semibold text-foreground">{t.name ?? "Name not given"}</span>
                      <span className="ml-2 text-xs text-muted-foreground">{t.roomLabel} · {t.propertyName}</span>
                    </span>
                    <span className="font-semibold text-destructive tabular-nums">{formatUgx(t.balanceUgx)}</span>
                  </li>
                ))}
              </ul>
              <Link href="/landlord/tenants" className="mt-2 inline-block text-sm text-primary hover:underline">
                {owing.length > OWING_SHOWN ? `See all ${owing.length} and record payments` : "Record payments in Tenants"}
              </Link>
            </>
          )}
        </div>
      </div>
    </Card>
  );
}
