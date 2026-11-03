'use client';
import { useState } from 'react';
import { officeCaseSchema } from '@campushomes/shared';
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
  useMutation,
} from '@/components/management/management-ui';
export interface OfficePayload {
  rows: {
    id: string;
    kind: string;
    subject: string;
    customerName: string;
    contact: string;
    notes: string;
    catchment: string;
    status: string;
    scheduledAt: string | null;
    reservationId: string | null;
    reservationStatus: string | null;
    propertyName: string | null;
    paymentStatus: string | null;
  }[];
  catchments: string[];
  manageCatchments: string[];
  supervise: boolean;
  asOf: string;
}
export function FrontDesk({ data }: { data: OfficePayload }) {
  const [filter, setFilter] = useState('active');
  const [search, setSearch] = useState('');
  const [creating, setCreating] = useState(false);
  const [kind, setKind] = useState('inquiry');
  const [validation, setValidation] = useState('');
  const mutation = useMutation();
  const rows = data.rows.filter(
    (r) =>
      (filter === 'all' || filter === 'active'
        ? filter === 'all' || r.status !== 'closed'
        : r.status === filter) &&
      `${r.subject} ${r.customerName} ${r.contact}`.toLowerCase().includes(search.toLowerCase()),
  );
  async function create(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const v = formValues(form);
    const parsed = officeCaseSchema.safeParse({
      ...v,
      reservationId: v.reservationId || undefined,
      scheduledAt: v.scheduledAt ? new Date(v.scheduledAt).toISOString() : undefined,
    });
    if (!parsed.success) {
      setValidation(parsed.error.issues[0]?.message ?? 'Check this form');
      return;
    }
    setValidation('');
    if (await mutation.run('/admin/office', 'POST', parsed.data)) {
      setCreating(false);
      form.reset();
    }
  }
  return (
    <div className="space-y-6">
      {mutation.feedback}
      <div className="grid gap-3 sm:grid-cols-3">
        {[
          ['Open cases', data.rows.filter((r) => r.status !== 'closed').length],
          ['Needs a supervisor', data.rows.filter((r) => r.status === 'escalated').length],
          [
            'Appointments',
            data.rows.filter((r) => r.kind === 'appointment' && r.status !== 'closed').length,
          ],
        ].map(([label, value]) => (
          <div
            key={label}
            className="min-w-0 rounded-xl border border-border bg-card p-4 [overflow-wrap:anywhere]"
          >
            <p className="text-sm text-muted-foreground">{label}</p>
            <p className="mt-2 text-3xl font-semibold tabular-nums">{value}</p>
          </div>
        ))}
      </div>
      <div className="flex flex-wrap items-end gap-3">
        <div className="min-w-0 flex-1">
          <Field label="Find a case">
            <input
              className={fieldClass}
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Customer or subject"
            />
          </Field>
        </div>
        <Field label="Status">
          <select className={fieldClass} value={filter} onChange={(e) => setFilter(e.target.value)}>
            {['active', 'open', 'in_progress', 'escalated', 'closed', 'all'].map((s) => (
              <option key={s} value={s}>
                {s.replaceAll('_', ' ')}
              </option>
            ))}
          </select>
        </Field>
        <Button
          disabled={!data.manageCatchments.length}
          type="button"
          variant={creating ? 'secondary' : 'primary'}
          aria-expanded={creating}
          onClick={() => setCreating(!creating)}
        >
          {creating ? 'Cancel new case' : 'New case'}
        </Button>
      </div>
      {creating && (
        <Panel title="New office case">
          <form onSubmit={create} className="grid gap-4 sm:grid-cols-2">
            <Field label="Case type">
              <select
                name="kind"
                className={fieldClass}
                value={kind}
                onChange={(e) => setKind(e.target.value)}
              >
                {['inquiry', 'onboarding', 'appointment', 'refund_request'].map((s) => (
                  <option key={s} value={s}>
                    {s.replaceAll('_', ' ')}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Catchment">
              <select name="catchment" className={fieldClass} required>
                {data.manageCatchments.map((c) => (
                  <option key={c}>{c}</option>
                ))}
              </select>
            </Field>
            <Field label="Customer name">
              <input name="customerName" required maxLength={150} className={fieldClass} />
            </Field>
            <Field label="Contact email or phone">
              <input name="contact" maxLength={200} className={fieldClass} />
            </Field>
            <Field label="Reservation reference, if applicable">
              <input
                name="reservationId"
                className={fieldClass}
                placeholder="Full reservation ID"
              />
            </Field>
            <Field label="Subject">
              <input name="subject" required minLength={2} maxLength={150} className={fieldClass} />
            </Field>
            {kind === 'appointment' && (
              <Field label="Appointment date and time">
                <input type="datetime-local" name="scheduledAt" required className={fieldClass} />
              </Field>
            )}
            <div className="sm:col-span-2">
              <Field label="Notes">
                <textarea name="notes" maxLength={5000} rows={3} className={fieldClass} />
              </Field>
            </div>
            {validation && (
              <p role="alert" className="text-sm text-destructive sm:col-span-2">
                {validation}
              </p>
            )}
            <SubmitButton pending={mutation.pending}>Create case</SubmitButton>
          </form>
        </Panel>
      )}
      <Panel
        title={data.supervise ? 'Office case queue' : 'Your case queue'}
        description="Up to 200 cases, with escalations first. Refund requests are routed for review."
      >
        {rows.length ? (
          <div className="divide-y divide-border">
            {rows.map((r) => (
              <article
                key={r.id}
                className="grid min-w-0 gap-4 py-5 first:pt-0 lg:grid-cols-[minmax(0,1fr)_auto]"
              >
                <div className="min-w-0">
                  <div className="mb-2 flex flex-wrap items-center gap-2">
                    <StateBadge value={r.kind} />
                    <span className="text-xs text-muted-foreground">{r.catchment}</span>
                  </div>
                  <h3 className="break-words font-semibold">{r.subject}</h3>
                  <p className="mt-1 break-words text-sm">
                    {r.customerName}
                    {r.contact && ` · ${r.contact}`}
                  </p>
                  {r.scheduledAt && (
                    <p className="mt-2 text-sm font-medium">{dateTime(r.scheduledAt)} EAT</p>
                  )}
                  {r.reservationId && (
                    <p className="mt-2 break-words text-sm">
                      {r.propertyName} · Reservation: {r.reservationStatus} · Payment record:{' '}
                      {r.paymentStatus?.replaceAll('_', ' ')}
                    </p>
                  )}
                  {r.notes && (
                    <p className="mt-2 whitespace-pre-wrap break-words text-sm text-muted-foreground">
                      {r.notes}
                    </p>
                  )}
                </div>
                <div className="min-w-0">
                  <Field label="Case status">
                    <select
                      aria-label={`Status for ${r.subject}`}
                      value={r.status}
                      disabled={mutation.pending || !data.manageCatchments.includes(r.catchment)}
                      className={fieldClass}
                      onChange={(e) =>
                        mutation.run(`/admin/office/${r.id}`, 'PATCH', { status: e.target.value })
                      }
                    >
                      {['open', 'in_progress', 'escalated', 'closed'].map((s) => (
                        <option key={s} value={s}>
                          {s.replaceAll('_', ' ')}
                        </option>
                      ))}
                    </select>
                  </Field>
                </div>
              </article>
            ))}
          </div>
        ) : (
          <Empty>No cases match this view. Create a case when a customer needs assistance.</Empty>
        )}
      </Panel>
      <p className="text-xs text-muted-foreground">
        Updated {dateTime(data.asOf)} EAT · {data.catchments.join(', ')}
      </p>
    </div>
  );
}
