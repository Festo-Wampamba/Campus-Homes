'use client';
import { useState } from 'react';
import { governanceRequestSchema } from '@campushomes/shared';
import { WorkflowButton as Button } from '@/components/management/management-ui';
import {
  dateTime,
  Empty,
  Field,
  fieldClass,
  formValues,
  Panel,
  StateBadge,
  SubmitButton,
  ugx,
  useMutation,
} from '@/components/management/management-ui';
export interface LeadershipPayload {
  properties: { catchment: string; properties: number; active: number }[];
  beds: number;
  reserved: number;
  booked: number;
  occupied: number;
  recordedCollectionsUgx: number;
  office: { open: number; escalated: number };
  catchments: string[];
  asOf: string;
}
export interface DecisionRequest {
  id: string;
  type: string;
  payload: { title: string; reason: string; amountUgx?: number };
  status: string;
  requestedBy: string;
  requesterName: string;
  reason: string | null;
  decidedAt: string | null;
}
export function Leadership({
  data,
  requests,
  userId,
  canRequest,
  canDecide,
}: {
  data: LeadershipPayload;
  requests: DecisionRequest[];
  userId: string;
  canRequest: boolean;
  canDecide: boolean;
}) {
  const [creating, setCreating] = useState(false);
  const [filter, setFilter] = useState('pending');
  const [validation, setValidation] = useState('');
  const mutation = useMutation();
  const total = data.properties.reduce((sum, p) => sum + p.properties, 0);
  const highest = Math.max(1, ...data.properties.map((p) => p.properties));
  const occupancy = data.beds ? Math.round((data.occupied / data.beds) * 100) : null;
  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const v = formValues(e.currentTarget);
    const parsed = governanceRequestSchema.safeParse({
      ...v,
      amountUgx: v.amountUgx ? Number(v.amountUgx) : undefined,
    });
    if (!parsed.success) {
      setValidation(parsed.error.issues[0]?.message ?? 'Check this form');
      return;
    }
    setValidation('');
    if (await mutation.run('/admin/governance', 'POST', parsed.data)) setCreating(false);
  }
  return (
    <div className="space-y-6">
      {mutation.feedback}
      <div className="ch-auto-grid gap-3">
        {[
          ['Properties', total],
          ['Occupied beds', data.occupied],
          ['Bed occupancy', occupancy === null ? 'No inventory' : `${occupancy}%`],
          ['Office escalations', data.office.escalated],
        ].map(([label, value]) => (
          <div
            key={label}
            className="min-w-0 rounded-xl border border-border bg-card p-5 [overflow-wrap:anywhere]"
          >
            <p className="text-sm text-muted-foreground">{label}</p>
            <p className="mt-3 text-3xl font-semibold tabular-nums">{value}</p>
            {label === 'Bed occupancy' && (
              <p className="mt-2 text-xs text-muted-foreground">
                Occupied reservations ÷ {data.beds} active inventory beds
              </p>
            )}
          </div>
        ))}
      </div>
      <div className="grid gap-6 xl:grid-cols-[1.2fr_1fr]">
        <Panel
          title="Portfolio by catchment"
          description="Property count and active property count in the current access scope."
        >
          {data.properties.length ? (
            <div className="space-y-5">
              {data.properties.map((p) => (
                <div key={p.catchment}>
                  <div className="mb-2 flex flex-wrap justify-between gap-2 text-sm">
                    <span className="font-medium">{p.catchment}</span>
                    <span className="tabular-nums">
                      {p.properties} total · {p.active} active
                    </span>
                  </div>
                  <div className="h-3 overflow-hidden rounded-full bg-muted">
                    <div
                      role="img"
                      aria-label={`${p.catchment}: ${p.properties} properties, ${p.active} active`}
                      className="h-full rounded-full bg-primary"
                      style={{ width: `${(p.properties / highest) * 100}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <Empty>No properties have been recorded in this scope.</Empty>
          )}
        </Panel>
        <Panel title="Operational position">
          <dl className="divide-y divide-border">
            {[
              ['Reserved beds', data.reserved],
              ['Booked beds', data.booked],
              ['Open office cases', data.office.open],
              ['Recorded collections · last 30 days', ugx(data.recordedCollectionsUgx)],
            ].map(([label, value]) => (
              <div key={label} className="flex flex-wrap justify-between gap-2 py-4 first:pt-0">
                <dt className="text-sm text-muted-foreground">{label}</dt>
                <dd className="font-semibold tabular-nums">{value}</dd>
              </div>
            ))}
          </dl>
          <p className="mt-4 text-xs leading-relaxed text-muted-foreground">
            Collections are booking fees and deposits recorded against reservations. They are not
            company profit or verified bank receipts.
          </p>
        </Panel>
      </div>
      {canRequest && (
        <Panel
          title="Business decisions"
          description="Independent approval for expenditure, refunds, policy changes and senior appointments."
        >
          <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
            <Field label="Show decisions">
              <select
                className={fieldClass}
                value={filter}
                onChange={(e) => setFilter(e.target.value)}
              >
                {['pending', 'approved', 'rejected', 'all'].map((s) => (
                  <option key={s}>{s}</option>
                ))}
              </select>
            </Field>
            <Button
              type="button"
              variant={creating ? 'secondary' : 'primary'}
              aria-expanded={creating}
              onClick={() => setCreating(!creating)}
            >
              {creating ? 'Cancel request' : 'Request a decision'}
            </Button>
          </div>
          {creating && (
            <form
              onSubmit={submit}
              className="mb-6 grid gap-4 rounded-lg border border-border bg-muted/30 p-4 sm:grid-cols-2"
            >
              <Field label="Decision type">
                <select name="type" className={fieldClass}>
                  {[
                    'expenditure',
                    'refund_authorisation',
                    'policy_change',
                    'senior_appointment',
                  ].map((s) => (
                    <option key={s} value={s}>
                      {s.replaceAll('_', ' ')}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Amount in UGX, if applicable">
                <input
                  name="amountUgx"
                  type="number"
                  min={1}

                  step={1}
                  className={fieldClass}
                />
              </Field>
              <div className="sm:col-span-2">
                <Field label="Title">
                  <input
                    name="title"
                    required
                    minLength={2}
                    maxLength={150}
                    className={fieldClass}
                  />
                </Field>
              </div>
              <div className="sm:col-span-2">
                <Field label="Reason and supporting context">
                  <textarea
                    name="reason"
                    required
                    minLength={5}
                    maxLength={5000}
                    rows={3}
                    className={fieldClass}
                  />
                </Field>
              </div>
              {validation && (
                <p role="alert" className="text-sm text-destructive sm:col-span-2">
                  {validation}
                </p>
              )}
              <SubmitButton pending={mutation.pending}>Submit for approval</SubmitButton>
            </form>
          )}
          <div className="space-y-4">
            {requests
              .filter((r) => filter === 'all' || r.status === filter)
              .map((r) => (
                <article key={r.id} className="min-w-0 rounded-lg border border-border p-4">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <h3 className="break-words font-semibold">{r.payload.title}</h3>
                    <StateBadge value={r.status} />
                  </div>
                  <p className="mt-2 text-xs text-muted-foreground">
                    {r.type.replaceAll('_', ' ')} · Requested by {r.requesterName}
                  </p>
                  {r.payload.amountUgx !== undefined && (
                    <p className="mt-3 text-xl font-semibold tabular-nums">
                      {ugx(r.payload.amountUgx)}
                    </p>
                  )}
                  <p className="mt-3 whitespace-pre-wrap break-words text-sm">{r.payload.reason}</p>
                  {r.reason && (
                    <p className="mt-3 text-sm text-muted-foreground">Decision: {r.reason}</p>
                  )}
                  {r.status === 'pending' &&
                    (canDecide && r.requestedBy !== userId ? (
                      <form
                        onSubmit={(e) => {
                          e.preventDefault();
                          const v = formValues(e.currentTarget);
                          const native = e.nativeEvent as SubmitEvent;
                          const decision = (native.submitter as HTMLButtonElement)?.value;
                          if (decision)
                            mutation.run(`/admin/governance/${r.id}/decision`, 'POST', {
                              decision,
                              reason: v.reason,
                            });
                        }}
                        className="mt-4 space-y-3"
                      >
                        <Field label="Decision reason">
                          <input name="reason" required maxLength={500} className={fieldClass} />
                        </Field>
                        <div className="flex flex-wrap gap-2">
                          <Button
                            name="decision"
                            value="approved"
                            type="submit"
                            disabled={mutation.pending}
                          >
                            Approve
                          </Button>
                          <Button
                            name="decision"
                            value="rejected"
                            type="submit"
                            variant="secondary"
                            disabled={mutation.pending}
                          >
                            Reject
                          </Button>
                        </div>
                      </form>
                    ) : (
                      <p className="mt-4 text-sm text-muted-foreground">
                        Awaiting an independent director&apos;s decision.
                      </p>
                    ))}
                </article>
              ))}
            {!requests.some((r) => filter === 'all' || r.status === filter) && (
              <Empty>No {filter === 'all' ? 'business' : filter} decisions in this view.</Empty>
            )}
          </div>
          <p className="mt-5 text-xs leading-relaxed text-muted-foreground">
            Approval records the business decision. Finance or the authorised administrator must
            carry out the approved action through its normal controls.
          </p>
        </Panel>
      )}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-xs text-muted-foreground">
          Updated {dateTime(data.asOf)} EAT · {data.catchments.join(', ')}
        </p>

      </div>
    </div>
  );
}
