'use client';
import Link from 'next/link';
import { useState } from 'react';
import { createMandateSchema, type ManagementCapability } from '@campushomes/shared';
import { WorkflowButton as Button } from '@/components/management/management-ui';
import {
  CapabilityList,
  CapabilityPicker,
  ConfirmAction,
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
export interface OwnerPayload {
  asOf: string;
  properties: { id: string; name: string }[];
  agencies: { id: string; name: string }[];
  mandates: {
    id: string;
    propertyId: string;
    propertyName: string;
    status: string;
    capabilities: ManagementCapability[];
    startsAt: string;
    endsAt: string;
    reason: string;
    managerName: string;
    agencyId: string | null;
  }[];
  notes: {
    id: string;
    kind: string;
    title: string;
    body: string;
    status: string;
    propertyName: string;
    createdAt: string;
  }[];
}
export function OwnerManagement({ data, initialPropertyId, startCreating = false }: { data: OwnerPayload; initialPropertyId?: string; startCreating?: boolean }) {
  const [creating, setCreating] = useState(startCreating);
  const [target, setTarget] = useState('individual');
  const [caps, setCaps] = useState<ManagementCapability[]>(['property.read']);
  const [validation, setValidation] = useState('');
  const mutation = useMutation();
  async function create(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const v = formValues(e.currentTarget);
    const parsed = createMandateSchema.safeParse({
      propertyId: v.propertyId,
      managerEmail: target === 'individual' ? v.managerEmail : undefined,
      agencyId: target === 'agency' ? v.agencyId : undefined,
      capabilities: caps,
      startsAt: v.startsAt ? new Date(v.startsAt).toISOString() : '',
      endsAt: v.endsAt ? new Date(v.endsAt).toISOString() : '',
      reason: v.reason,
    });
    if (!parsed.success) {
      setValidation(parsed.error.issues[0]?.message ?? 'Check this form');
      return;
    }
    setValidation('');
    if (await mutation.run('/management/mandates', 'POST', parsed.data)) {
      setCreating(false);
      setCaps(['property.read']);
    }
  }
  return (
    <div className="space-y-6">
      {mutation.feedback}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="max-w-2xl text-sm leading-relaxed text-muted-foreground">
          A mandate grants access to one property for a fixed period. The recipient must accept
          before access begins.
        </p>
        <Button
          onClick={() => setCreating(!creating)}
          aria-expanded={creating}
          disabled={!data.properties.length}
        >
          {creating ? 'Cancel mandate' : 'Delegate management'}
        </Button>
      </div>
      {creating && (
        <Panel title="Create a management mandate">
          <form onSubmit={create} className="grid gap-5 lg:grid-cols-2">
            <div className="space-y-4">
              <Field label="Property">
                <select aria-label="Property" name="propertyId" defaultValue={data.properties.some(p => p.id === initialPropertyId) ? initialPropertyId : undefined} className={fieldClass} required>
                  {data.properties.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Delegate to">
                <select
                  value={target}
                  onChange={(e) => setTarget(e.target.value)}
                  className={fieldClass}
                >
                  <option value="individual">Individual manager</option>
                  <option value="agency">Property management agency</option>
                </select>
              </Field>
              {target === 'individual' ? (
                <Field label="Manager's registered email">
                  <input name="managerEmail" type="email" required className={fieldClass} />
                </Field>
              ) : (
                <Field label="Registered agency">
                  <select name="agencyId" required className={fieldClass}>
                    <option value="">Choose an agency</option>
                    {data.agencies.map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.name}
                      </option>
                    ))}
                  </select>
                </Field>
              )}
              <p className="text-xs leading-relaxed text-muted-foreground">
                Managers need an active CampusHomes customer account. Agencies register through the
                property management workspace.
              </p>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Starts at">
                  <input type="datetime-local" name="startsAt" required className={fieldClass} />
                </Field>
                <Field label="Expires at">
                  <input type="datetime-local" name="endsAt" required className={fieldClass} />
                </Field>
              </div>
              <Field label="Management authorisation and scope">
                <textarea
                  name="reason"
                  required
                  maxLength={500}
                  rows={3}
                  className={fieldClass}
                  placeholder="Describe the authorisation and agreed responsibilities"
                />
              </Field>
            </div>
            <div>
              <CapabilityPicker value={caps} onChange={setCaps} />
              <p className="mt-4 text-xs leading-relaxed text-muted-foreground">
                Ownership, payout destinations, identity documents and CampusHomes verification
                approvals stay outside this mandate.
              </p>
            </div>
            {validation && (
              <p role="alert" className="text-sm text-destructive lg:col-span-2">
                {validation}
              </p>
            )}
            <SubmitButton pending={mutation.pending}>Send mandate for acceptance</SubmitButton>
          </form>
        </Panel>
      )}
      <Panel
        title="Management mandates"
        description="Review each property's recipient, permissions and access period."
      >
        {data.mandates.length ? (
          <div className="divide-y divide-border">
            {data.mandates.map((m) => (
              <article key={m.id} className="space-y-4 py-5 first:pt-0">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h3 className="break-words font-semibold">{m.propertyName}</h3>
                    <p className="mt-1 break-words text-sm text-muted-foreground">
                      {m.managerName} · {m.agencyId ? 'Agency' : 'Individual'}
                    </p>
                  </div>
                  <StateBadge
                    value={
                      m.status === 'active' && new Date(m.endsAt).getTime() < Date.parse(data.asOf)
                        ? 'expired'
                        : m.status
                    }
                  />
                </div>
                <CapabilityList value={m.capabilities} />
                <p className="text-xs leading-relaxed text-muted-foreground">
                  {dateTime(m.startsAt)} → {dateTime(m.endsAt)} EAT
                </p>
                <p className="whitespace-pre-wrap break-words text-sm">{m.reason}</p>
                {['pending', 'active'].includes(m.status) && (
                  <ConfirmAction
                    label="Revoke mandate"
                    disabled={mutation.pending}
                    onConfirm={() => mutation.run(`/management/mandates/${m.id}`, 'DELETE')}
                  />
                )}
              </article>
            ))}
          </div>
        ) : (
          <Empty>
            No management mandates yet. Delegate a property when you are ready to appoint a manager.
          </Empty>
        )}
      </Panel>
      <Panel
        title="Property reports and activity"
        description="Reports, notices and maintenance records submitted by your managers."
      >
        {data.notes.length ? (
          <div className="divide-y divide-border">
            {data.notes.map((n) => (
              <article key={n.id} className="space-y-2 py-4 first:pt-0">
                <div className="flex flex-wrap justify-between gap-2">
                  <h3 className="break-words font-medium">{n.title}</h3>
                  <StateBadge value={n.kind} />
                </div>
                <p className="text-xs text-muted-foreground">
                  {n.propertyName} · {dateTime(n.createdAt)}
                </p>
                <p className="whitespace-pre-wrap break-words text-sm">{n.body}</p>
                <StateBadge
                  value={
                    n.kind === 'notice' ? 'published' : n.kind === 'report' ? 'submitted' : n.status
                  }
                />
              </article>
            ))}
          </div>
        ) : (
          <Empty>Your managers&apos; property records will appear here.</Empty>
        )}
      </Panel>
      <Link
        href="/management"
        className="inline-block py-3 text-sm font-semibold text-primary underline underline-offset-4"
      >
        Open the property management workspace
      </Link>
    </div>
  );
}
