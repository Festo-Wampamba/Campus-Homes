'use client';
import Link from 'next/link';
import { useState } from 'react';
import { WORKER_TYPES, propertyTeamAssignmentSchema, type AssignedProperty, type OwnerPropertyTeam } from '@campushomes/shared';
import { Button } from '@/components/ui/button';
import { ConfirmAction, Empty, Field, fieldClass, formValues, Panel, StateBadge, SubmitButton, useMutation } from '@/components/management/management-ui';

const roleLabel = (role: string) => role === 'custodian' ? 'Custodian' : 'Property worker';
const duties = (value: string) => value.replaceAll('_', ' ');

export function AssignedProperties({ properties }: { properties: AssignedProperty[] }) {
  return <div className="grid gap-4 lg:grid-cols-2">{properties.length ? properties.map(p => (
    <Panel key={p.id} title={p.name} description={p.streetAddress}>
      <div className="space-y-3"><StateBadge value={roleLabel(p.role)} />
        {p.workerType && <p className="capitalize text-sm">{duties(p.workerType)}</p>}
        <p className="break-words text-sm text-muted-foreground">Property owner: {p.ownerName || 'Your landlord'}</p>
        {p.contactPhone && <a className="inline-flex min-h-11 items-center font-semibold text-primary underline underline-offset-4" href={`tel:${p.contactPhone}`}>Contact property: {p.contactPhone}</a>}
        <p className="text-sm leading-relaxed text-muted-foreground">Coordinate your on-site duties with the property owner. This assignment gives no ownership, payout control or company administration access.</p>
      </div>
    </Panel>
  )) : <Panel title="No current assignments"><Empty>Your landlord can assign you to a property using your verified CampusHomes email. Removed assignments no longer appear here.</Empty></Panel>}</div>;
}

export function PropertyTeam({ data, initialPropertyId }: { data: OwnerPropertyTeam; initialPropertyId?: string }) {
  const initial = data.properties.some(p => p.id === initialPropertyId) ? initialPropertyId! : data.properties[0]?.id ?? '';
  const [propertyId, setPropertyId] = useState(initial);
  const [role, setRole] = useState<'custodian' | 'property_worker'>('custodian');
  const [creating, setCreating] = useState(false);
  const [validation, setValidation] = useState('');
  const mutation = useMutation();
  const members = data.members.filter(m => m.propertyId === propertyId);
  async function assign(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const v = formValues(e.currentTarget);
    const result = propertyTeamAssignmentSchema.safeParse({ propertyId, role, email: v.email?.trim(),
      reason: v.reason, workerType: role === 'property_worker' ? v.workerType : undefined });
    if (!result.success) { setValidation(result.error.issues[0]?.message ?? 'Check the assignment'); return; }
    setValidation('');
    if (await mutation.run('/property-team/assignments', 'POST', result.data)) setCreating(false);
  }
  if (!data.properties.length) return <Panel title="Add a property first"><Empty>Once your landlord account is verified, assign your team to an owned property.</Empty>
    <Link href="/landlord/properties" className="mt-4 inline-flex min-h-11 items-center font-semibold text-primary underline">Open my properties</Link></Panel>;
  return <div className="space-y-6">
    {mutation.feedback}
    <Panel title="Choose a property" description="Every assignment applies only to the selected property. You can remove access at any time.">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end">
        <div className="min-w-0 flex-1"><Field label="Property"><select aria-label="Property" value={propertyId} onChange={e => {setPropertyId(e.target.value);setCreating(false);}} className={fieldClass}>
          {data.properties.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select></Field></div>
        <Button type="button" onClick={() => setCreating(!creating)} aria-expanded={creating} className="h-auto min-h-11 whitespace-normal">{creating ? 'Cancel assignment' : 'Assign custodian or worker'}</Button>
        <Link href={`/landlord/management?propertyId=${encodeURIComponent(propertyId)}&new=1`} className="inline-flex min-h-11 items-center justify-center rounded-lg border border-border px-4 py-2 text-center text-sm font-semibold hover:bg-muted focus-visible:outline-2 focus-visible:outline-ring">Appoint property manager</Link>
      </div>
    </Panel>
    {creating && <Panel title="Assign an on-site team member" description="The recipient needs an active CampusHomes customer account and a verified email. Company staff accounts cannot be assigned here.">
      <form onSubmit={assign} className="grid gap-4 sm:grid-cols-2">
        <Field label="Role"><select aria-label="Role" value={role} onChange={e => setRole(e.target.value as typeof role)} className={fieldClass}>
          <option value="custodian">Custodian</option><option value="property_worker">Property worker</option>
        </select></Field>
        <Field label="Registered email"><input type="email" name="email" autoComplete="email" required className={fieldClass} /></Field>
        {role === 'property_worker' && <Field label="Worker duties"><select aria-label="Worker duties" name="workerType" required className={`${fieldClass} capitalize`}>
          {WORKER_TYPES.map(type => <option key={type} value={type}>{duties(type)}</option>)}
        </select></Field>}
        <div className="sm:col-span-2"><Field label="Responsibilities and reason"><textarea name="reason" required minLength={3} maxLength={500} rows={3} className={fieldClass} placeholder="Describe their responsibilities at this property" /></Field></div>
        <p className="text-sm leading-relaxed text-muted-foreground sm:col-span-2">Access starts immediately and lasts until you remove the assignment. The team member can open Property team from their workspace chooser to see assigned properties.</p>
        {validation && <p role="alert" className="text-sm text-destructive sm:col-span-2">{validation}</p>}
        <div><SubmitButton pending={mutation.pending}>Assign to this property</SubmitButton></div>
      </form>
    </Panel>}
    <Panel title="On-site team" description="Custodians and workers assigned to this property. Removed assignments remain in your history.">
      {members.length ? <div className="divide-y divide-border">{members.map(m => <article key={m.id} className="flex flex-wrap items-start justify-between gap-4 py-4 first:pt-0">
        <div className="min-w-0 space-y-2"><h3 className="break-words font-semibold">{m.name || m.email || 'Team member'}</h3>
          <p className="break-words text-sm text-muted-foreground">{m.email}</p>
          <p className="text-sm">{roleLabel(m.role)}{m.workerType ? ` · ${duties(m.workerType)}` : ''}</p><StateBadge value={m.status} />
        </div>
        {m.status !== 'revoked' && <ConfirmAction label="Remove assignment" disabled={mutation.pending}
          onConfirm={() => mutation.run(`/property-team/memberships/${m.id}`, 'DELETE')} />}
      </article>)}</div> : <Empty>No custodians or workers assigned to this property yet.</Empty>}
    </Panel>
  </div>;
}
