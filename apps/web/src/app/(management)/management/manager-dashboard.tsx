'use client';
import { useEffect, useState } from 'react';
import { Building2, ChevronRight } from 'lucide-react';
import {
  createAgencySchema,
  managedPropertyUpdateSchema,
  managementNoteSchema,
  type ManagementCapability,
} from '@campushomes/shared';
import { api, apiErrorMessage } from '@/lib/api';
import { WorkflowButton as Button } from '@/components/management/management-ui';
import {
  tabKeyNavigation,
  CapabilityList,
  ConfirmAction,
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
import { AgencyTeam } from './team-management';
export interface ManagedProperty {
  id: string;
  name: string;
  streetAddress: string;
  description: string | null;
  contactPhone: string | null;
  contactEmail: string | null;
  operationalStatus: string;
  capabilities: ManagementCapability[];
}
export interface ManagerPayload {
  properties: ManagedProperty[];
  offers: {
    id: string;
    propertyName: string;
    capabilities: ManagementCapability[];
    startsAt: string;
    endsAt: string;
    reason: string;
    agencyName: string | null;
  }[];
  agencies: { id: string; name: string; memberRole: string }[];
  asOf: string;
}
interface PropertyDetail {
  units: { id: string; code: string; status: string }[];
  reservations: {
    id: string;
    status: string;
    unitCode: string;
    studentName: string;
    bookedAt: string | null;
    reservedAt: string | null;
  }[];
  finance: {
    id: string;
    status: string;
    bookingFeeCollectedUgx: number | null;
    depositCollectedUgx: number | null;
    recordedAt: string | null;
  }[];
  notes: {
    id: string;
    kind: string;
    title: string;
    body: string;
    status: string;
    createdAt: string;
  }[];
}
export function ManagerDashboard({ data, enrolled }: { data: ManagerPayload; enrolled: boolean }) {
  const [selectedId, setSelectedId] = useState(data.properties[0]?.id ?? '');
  const [agencyForm, setAgencyForm] = useState(false);
  const [validation, setValidation] = useState('');
  const mutation = useMutation();
  const selected = data.properties.find((p) => p.id === selectedId) ?? data.properties[0];
  async function createAgency(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const parsed = createAgencySchema.safeParse(formValues(e.currentTarget));
    if (!parsed.success) {
      setValidation(parsed.error.issues[0]?.message ?? 'Check the agency name');
      return;
    }
    setValidation('');
    if (await mutation.run('/management/agencies', 'POST', parsed.data)) setAgencyForm(false);
  }
  return (
    <div className="space-y-6">
      {mutation.feedback}
      {!enrolled && (
        <Panel
          title="Enable your management workspace"
          description="Use your own account for individual management or agency work. Each property still needs the landlord's mandate."
        >
          <Button
            disabled={mutation.pending}
            onClick={() => mutation.run('/management/enroll', 'POST')}
          >
            Enable property management
          </Button>
        </Panel>
      )}
      {data.offers.length > 0 && (
        <Panel title="Mandates awaiting your response">
          <div className="divide-y divide-border">
            {data.offers.map((o) => (
              <article key={o.id} className="space-y-3 py-5 first:pt-0">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h3 className="font-semibold">{o.propertyName}</h3>
                  <StateBadge value="pending" />
                </div>
                {o.agencyName && (
                  <p className="text-sm text-muted-foreground">For {o.agencyName}</p>
                )}
                <CapabilityList value={o.capabilities} />
                <p className="text-xs text-muted-foreground">
                  {dateTime(o.startsAt)} → {dateTime(o.endsAt)} EAT
                </p>
                <p className="whitespace-pre-wrap break-words text-sm">{o.reason}</p>
                <div className="flex flex-wrap gap-2">
                  <Button
                    disabled={mutation.pending}
                    onClick={() =>
                      mutation.run(`/management/mandates/${o.id}/decision`, 'POST', {
                        decision: 'accept',
                      })
                    }
                  >
                    Accept mandate
                  </Button>
                  <ConfirmAction
                    label="Decline mandate"
                    disabled={mutation.pending}
                    onConfirm={() =>
                      mutation.run(`/management/mandates/${o.id}/decision`, 'POST', {
                        decision: 'reject',
                      })
                    }
                  />
                </div>
              </article>
            ))}
          </div>
        </Panel>
      )}
      <div className="grid min-w-0 gap-6 xl:grid-cols-[280px_minmax(0,1fr)]">
        <aside className="min-w-0">
          <Panel
            title="Your properties"
            description={`${data.properties.length} active assignments`}
          >
            <div className="space-y-2">
              {data.properties.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  aria-pressed={selected?.id === p.id}
                  onClick={() => setSelectedId(p.id)}
                  className={`flex min-h-14 w-full items-start gap-3 rounded-lg border p-3 text-left focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring ${selected?.id === p.id ? 'border-primary bg-primary/5' : 'border-border hover:bg-muted'}`}
                >
                  <Building2 aria-hidden className="mt-0.5 size-4 shrink-0 text-primary" />
                  <span className="min-w-0 flex-1">
                    <span className="block break-words text-sm font-semibold">{p.name}</span>
                    <span className="mt-1 block break-words text-xs text-muted-foreground">
                      {p.streetAddress}
                    </span>
                  </span>
                  <ChevronRight aria-hidden className="size-4 shrink-0" />
                </button>
              ))}
              {!data.properties.length && (
                <Empty>Accepted, active property assignments will appear here.</Empty>
              )}
            </div>
          </Panel>
        </aside>
        <div className="min-w-0">
          {selected ? (
            <ManagedPropertyPanel key={selected.id} property={selected} revision={data.asOf} />
          ) : (
            <Panel title="Ready for your next property">
              <Empty>
                Ask the landlord to create a mandate using your registered email or your agency.
                Agency membership by itself does not grant property access.
              </Empty>
            </Panel>
          )}
        </div>
      </div>
      <Panel
        title="Agency membership"
        description="Each person uses their own account. Agency owners can add members; property permissions are assigned separately."
      >
        <div className="space-y-5">
          {data.agencies.map((a) => (
            <AgencyTeam key={a.id} agency={a} />
          ))}
          {!data.agencies.length && (
            <Empty>
              You are not a member of an agency. Individual managers can work without one.
            </Empty>
          )}
          <Button
            type="button"
            variant="secondary"
            aria-expanded={agencyForm}
            onClick={() => setAgencyForm(!agencyForm)}
          >
            {agencyForm ? 'Cancel agency' : 'Register an agency'}
          </Button>
          {agencyForm && (
            <form onSubmit={createAgency} className="flex flex-wrap items-end gap-3">
              <div className="min-w-0 flex-1">
                <Field label="Agency name">
                  <input
                    name="name"
                    required
                    minLength={2}
                    maxLength={150}
                    className={fieldClass}
                  />
                </Field>
              </div>
              <SubmitButton pending={mutation.pending}>Register agency</SubmitButton>
              {validation && (
                <p role="alert" className="w-full text-sm text-destructive">
                  {validation}
                </p>
              )}
            </form>
          )}
        </div>
      </Panel>
      <p className="text-xs text-muted-foreground">Updated {dateTime(data.asOf)} EAT</p>
    </div>
  );
}
function ManagedPropertyPanel({
  property,
  revision,
}: {
  property: ManagedProperty;
  revision: string;
}) {
  const [detail, setDetail] = useState<PropertyDetail | null>(null);
  const [error, setError] = useState('');
  const [tab, setTab] = useState('overview');
  const [kind, setKind] = useState('maintenance');
  const mutation = useMutation();
  useEffect(() => {
    const controller = new AbortController();
    api<PropertyDetail>(`/management/properties/${property.id}`, { signal: controller.signal })
      .then((v) => {
        setDetail(v);
        setError('');
      })
      .catch((e) => {
        if (!controller.signal.aborted)
          setError(apiErrorMessage(e, 'Could not load this property. Refresh to try again.'));
      });
    return () => controller.abort();
  }, [property.id, revision]);
  const has = (cap: ManagementCapability) => property.capabilities.includes(cap);
  const tabs = [
    { key: 'overview', label: 'Property' },
    ...(has('reservations.read') ? [{ key: 'reservations', label: 'Reservations' }] : []),
    ...(has('finance.read') ? [{ key: 'finance', label: 'Statements' }] : []),
    ...(has('maintenance.manage') || has('notices.manage') || has('reports.submit')
      ? [{ key: 'activity', label: 'Activity & reports' }]
      : []),
    ...(has('team.manage') ? [{ key: 'team', label: 'Property team' }] : []),
  ];
  const kinds = [
    ...(has('maintenance.manage') ? ['maintenance', 'incident'] : []),
    ...(has('notices.manage') ? ['notice'] : []),
    ...(has('reports.submit') ? ['report'] : []),
  ];
  const selectedKind = kinds.includes(kind) ? kind : kinds[0];
  async function edit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const parsed = managedPropertyUpdateSchema.safeParse(
      (() => {
        const v = formValues(e.currentTarget);
        return {
          ...v,
          contactPhone: v.contactPhone || undefined,
          contactEmail: v.contactEmail || undefined,
        };
      })(),
    );
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? 'Check the property details');
      return;
    }
    await mutation.run(`/management/properties/${property.id}`, 'PATCH', parsed.data);
  }
  async function addNote(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const parsed = managementNoteSchema.safeParse({ ...formValues(form), kind: selectedKind });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? 'Check the record');
      return;
    }
    if (await mutation.run(`/management/properties/${property.id}/notes`, 'POST', parsed.data))
      form.reset();
  }
  return (
    <Panel title={property.name} description={property.streetAddress}>
      <div className="space-y-5">
        <CapabilityList value={property.capabilities} />
        <div
          role="tablist"
          onKeyDown={tabKeyNavigation}
          aria-label="Property sections"
          className="flex flex-wrap gap-2 border-b border-border pb-3"
        >
          {tabs.map((t) => (
            <Button
              key={t.key}
              type="button"
              role="tab"
              tabIndex={tab === t.key ? 0 : -1}
              id={`tab-${t.key}`}
              aria-controls={`panel-${t.key}`}
              aria-selected={tab === t.key}
              variant={tab === t.key ? 'primary' : 'secondary'}
              onClick={() => setTab(t.key)}
            >
              {t.label}
            </Button>
          ))}
        </div>
        {mutation.feedback}
        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}
        {!detail && !error && (
          <p role="status" className="py-6 text-sm text-muted-foreground">
            Loading property records…
          </p>
        )}
        <div role="tabpanel" id={`panel-${tab}`} aria-labelledby={`tab-${tab}`}>
          {tab === 'overview' && (
            <div className="space-y-5">
              <StateBadge value={property.operationalStatus} />
              {has('property.edit') ? (
                <form onSubmit={edit} className="space-y-4">
                  <Field label="Property description">
                    <textarea
                      name="description"
                      maxLength={5000}
                      defaultValue={property.description ?? ''}
                      rows={4}
                      className={fieldClass}
                    />
                  </Field>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <Field label="Property contact phone">
                      <input
                        name="contactPhone"
                        minLength={7}
                        maxLength={30}
                        type="tel"
                        defaultValue={property.contactPhone ?? ''}
                        className={fieldClass}
                      />
                    </Field>
                    <Field label="Property contact email">
                      <input
                        name="contactEmail"
                        type="email"
                        defaultValue={property.contactEmail ?? ''}
                        className={fieldClass}
                      />
                    </Field>
                  </div>
                  <SubmitButton pending={mutation.pending}>Save property contacts</SubmitButton>
                </form>
              ) : (
                <p className="whitespace-pre-wrap break-words text-sm text-muted-foreground">
                  {property.description || 'No property description recorded.'}
                </p>
              )}
              {detail && (
                <div>
                  <h3 className="mb-3 font-semibold">Room inventory</h3>
                  {detail.units.length ? (
                    <ul className="grid gap-2 sm:grid-cols-2">
                      {detail.units.map((u) => (
                        <li
                          key={u.id}
                          className="flex flex-wrap justify-between gap-2 rounded-lg bg-muted p-3 text-sm"
                        >
                          <span>{u.code}</span>
                          <StateBadge value={u.status} />
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <Empty>No room inventory recorded.</Empty>
                  )}
                </div>
              )}
            </div>
          )}
          {tab === 'reservations' && detail && (
            <div className="space-y-3">
              <p className="text-xs text-muted-foreground">
                Latest 100 reservations. Booking and payment changes remain with the authorised
                owner workflow.
              </p>
              {detail.reservations.map((r) => (
                <article
                  key={r.id}
                  className="flex flex-wrap justify-between gap-3 border-b border-border py-3"
                >
                  <div>
                    <p className="font-medium">{r.studentName}</p>
                    <p className="text-sm text-muted-foreground">{r.unitCode}</p>
                  </div>
                  <StateBadge value={r.status} />
                </article>
              ))}
              {!detail.reservations.length && (
                <Empty>No reservations recorded for this property.</Empty>
              )}
            </div>
          )}
          {tab === 'finance' && detail && (
            <div className="space-y-3">
              <p className="text-sm text-muted-foreground">
                Latest 100 reservation records. Recorded fees and deposits are reported collections;
                they do not confirm bank settlement.
              </p>
              {detail.finance.map((r) => (
                <article
                  key={r.id}
                  className="flex flex-wrap justify-between gap-3 border-b border-border py-3 text-sm"
                >
                  <div>
                    <StateBadge value={r.status} />
                    <p className="mt-2 text-xs text-muted-foreground">
                      {r.recordedAt ? dateTime(r.recordedAt) : 'Payment not recorded'}
                    </p>
                  </div>
                  <div>
                    <p>
                      Booking fee:{' '}
                      {r.bookingFeeCollectedUgx === null
                        ? 'Not recorded'
                        : ugx(r.bookingFeeCollectedUgx)}
                    </p>
                    <p>
                      Deposit:{' '}
                      {r.depositCollectedUgx === null ? 'Not recorded' : ugx(r.depositCollectedUgx)}
                    </p>
                  </div>
                </article>
              ))}
              {!detail.finance.length && <Empty>No financial records for this property.</Empty>}
            </div>
          )}
          {tab === 'activity' && detail && (
            <div className="space-y-6">
              <form onSubmit={addNote} className="space-y-4">
                <Field label="Record type">
                  <select
                    className={fieldClass}
                    value={selectedKind}
                    onChange={(e) => setKind(e.target.value)}
                  >
                    {kinds.map((k) => (
                      <option key={k}>{k}</option>
                    ))}
                  </select>
                </Field>
                <Field label="Title">
                  <input
                    name="title"
                    required
                    minLength={2}
                    maxLength={150}
                    className={fieldClass}
                  />
                </Field>
                <Field label="Details">
                  <textarea name="body" required maxLength={5000} rows={4} className={fieldClass} />
                </Field>
                <SubmitButton pending={mutation.pending}>
                  {selectedKind === 'notice'
                    ? 'Publish notice'
                    : selectedKind === 'report'
                      ? 'Submit report to landlord'
                      : 'Create record'}
                </SubmitButton>
              </form>
              <div className="divide-y divide-border">
                {detail.notes.map((n) => (
                  <article key={n.id} className="space-y-2 py-4">
                    <div className="flex flex-wrap justify-between gap-2">
                      <h3 className="break-words font-semibold">{n.title}</h3>
                      <StateBadge value={n.kind} />
                    </div>
                    <p className="whitespace-pre-wrap break-words text-sm">{n.body}</p>
                    <p className="text-xs text-muted-foreground">{dateTime(n.createdAt)}</p>
                    {['maintenance', 'incident'].includes(n.kind) ? (
                      <Field label={`Status for ${n.title}`}>
                        <select
                          className={fieldClass}
                          value={n.status}
                          disabled={mutation.pending}
                          onChange={(e) =>
                            mutation.run(`/management/notes/${n.id}`, 'PATCH', {
                              status: e.target.value,
                            })
                          }
                        >
                          {['open', 'in_progress', 'resolved'].map((s) => (
                            <option key={s} value={s}>
                              {s.replaceAll('_', ' ')}
                            </option>
                          ))}
                        </select>
                      </Field>
                    ) : (
                      <StateBadge value={n.kind === 'notice' ? 'published' : 'submitted'} />
                    )}
                  </article>
                ))}
              </div>
            </div>
          )}
          {tab === 'team' && <PropertyTeam propertyId={property.id} revision={revision} />}
        </div>
      </div>
    </Panel>
  );
}
import { PropertyTeam } from './team-management';
