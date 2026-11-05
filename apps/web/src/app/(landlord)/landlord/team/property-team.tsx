'use client';
import Link from 'next/link';
import { useState } from 'react';
import {
  DEFAULT_TEAM_CAPABILITIES, TEAM_CAPABILITIES, TEAM_CAPABILITY_LABELS, WORKER_TYPES, propertyTeamAssignmentSchema,
  type AssignedProperty, type OwnerPropertyTeam, type PropertyTeamMember, type TeamCapability,
} from '@campushomes/shared';
import { Button } from '@/components/ui/button';
import { ConfirmAction, Empty, Field, fieldClass, formValues, Panel, StateBadge, SubmitButton, useMutation } from '@/components/management/management-ui';

const roleLabel = (role: string) => role === 'custodian' ? 'Custodian' : 'Property worker';
const duties = (value: string) => value.replaceAll('_', ' ');

function CapabilityChecks({ value, onChange, legend }: { value: TeamCapability[]; onChange: (next: TeamCapability[]) => void; legend: string }) {
  return <fieldset className="space-y-2">
    <legend className="mb-1 text-sm font-semibold">{legend}</legend>
    {TEAM_CAPABILITIES.map(cap => <label key={cap} className="flex min-h-11 items-center gap-3 text-sm">
      <input type="checkbox" className="size-4 accent-teal-700" checked={value.includes(cap)}
        onChange={e => onChange(e.target.checked ? [...value, cap] : value.filter(c => c !== cap))} />
      {TEAM_CAPABILITY_LABELS[cap]}
    </label>)}
    <p className="text-xs text-muted-foreground">Leave everything unticked to give view-only access to the property.</p>
  </fieldset>;
}

function MemberCapabilities({ member, pending, onSave }: { member: PropertyTeamMember; pending: boolean; onSave: (caps: TeamCapability[]) => Promise<boolean> }) {
  const [editing, setEditing] = useState(false);
  const [caps, setCaps] = useState<TeamCapability[]>(member.capabilities);
  if (!editing) return <div className="space-y-2">
    <ul className="flex flex-wrap gap-1.5">{member.capabilities.length
      ? member.capabilities.map(cap => <li key={cap} className="rounded-full bg-muted px-2.5 py-1 text-xs">{TEAM_CAPABILITY_LABELS[cap]}</li>)
      : <li className="text-xs text-muted-foreground">View-only: no actions allowed</li>}</ul>
    {member.status !== 'revoked' && <button type="button" onClick={() => { setCaps(member.capabilities); setEditing(true); }}
      className="inline-flex min-h-11 items-center text-sm font-semibold text-primary underline underline-offset-4">Change permissions</button>}
  </div>;
  return <div className="space-y-3 rounded-lg border border-border p-3">
    <CapabilityChecks legend="What they can do here" value={caps} onChange={setCaps} />
    <div className="flex gap-2">
      <Button type="button" disabled={pending} onClick={async () => { if (await onSave(caps)) setEditing(false); }}>Save permissions</Button>
      <Button type="button" variant="secondary" disabled={pending} onClick={() => setEditing(false)}>Cancel</Button>
    </div>
  </div>;
}

export function AssignedProperties({ properties }: { properties: AssignedProperty[] }) {
  return <div className="grid gap-4 lg:grid-cols-2">{properties.length ? properties.map(p => (
    <Panel key={p.id} title={p.name} description={p.streetAddress}>
      <div className="space-y-3"><StateBadge value={roleLabel(p.role)} />
        {p.workerType && <p className="capitalize text-sm">{duties(p.workerType)}</p>}
        <p className="break-words text-sm text-muted-foreground">Property owner: {p.ownerName || 'Your landlord'}</p>
        <div><p className="text-sm font-semibold">What you can do here</p>
          {p.capabilities.length
            ? <ul className="mt-1 list-disc space-y-1 pl-5 text-sm">{p.capabilities.map(cap => <li key={cap}>{TEAM_CAPABILITY_LABELS[cap]}</li>)}</ul>
            : <p className="mt-1 text-sm text-muted-foreground">View-only. Ask the owner if you need to do more.</p>}</div>
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
  const [caps, setCaps] = useState<TeamCapability[]>(DEFAULT_TEAM_CAPABILITIES.custodian);
  const [creating, setCreating] = useState(false);
  const [validation, setValidation] = useState('');
  const mutation = useMutation();
  const members = data.members.filter(m => m.propertyId === propertyId);
  async function assign(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const v = formValues(e.currentTarget);
    const result = propertyTeamAssignmentSchema.safeParse({ propertyId, role, email: v.email?.trim(),
      reason: v.reason, workerType: role === 'property_worker' ? v.workerType : undefined, capabilities: caps });
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
        <Field label="Role"><select aria-label="Role" value={role} onChange={e => { const next = e.target.value as typeof role; setRole(next); setCaps(DEFAULT_TEAM_CAPABILITIES[next]); }} className={fieldClass}>
          <option value="custodian">Custodian</option><option value="property_worker">Property worker</option>
        </select></Field>
        <Field label="Registered email"><input type="email" name="email" autoComplete="email" required className={fieldClass} /></Field>
        {role === 'property_worker' && <Field label="Worker duties"><select aria-label="Worker duties" name="workerType" required className={`${fieldClass} capitalize`}>
          {WORKER_TYPES.map(type => <option key={type} value={type}>{duties(type)}</option>)}
        </select></Field>}
        <div className="sm:col-span-2"><CapabilityChecks legend="What they can do at this property" value={caps} onChange={setCaps} /></div>
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
          <MemberCapabilities member={m} pending={mutation.pending}
            onSave={caps => mutation.run(`/property-team/memberships/${m.id}/capabilities`, 'PATCH', { capabilities: caps })} />
        </div>
        {m.status !== 'revoked' && <ConfirmAction label="Remove assignment" disabled={mutation.pending}
          onConfirm={() => mutation.run(`/property-team/memberships/${m.id}`, 'DELETE')} />}
      </article>)}</div> : <Empty>No custodians or workers assigned to this property yet.</Empty>}
    </Panel>
  </div>;
}
