import type { AssignedProperty, OwnerPropertyTeam } from '@campushomes/shared';
import { requireWorkspace } from '@/lib/session';
import { isPropertyTeamAccount } from '@/lib/auth-routing';
import { apiServerStrict } from '@/lib/server-api';
import { PageHeader } from '@/components/admin/admin-ui';
import { AssignedProperties, PropertyTeam } from './property-team';

export const metadata = { title: 'Property team' };
export default async function PropertyTeamPage({ searchParams }: { searchParams: Promise<{ propertyId?: string }> }) {
  const session = await requireWorkspace('landlord');
  if (isPropertyTeamAccount(session.access)) {
    const properties = await apiServerStrict<AssignedProperty[]>('/property-team/mine');
    return <><PageHeader eyebrow="On-site team" title="Assigned properties"
      description="Your current property assignments and the contact for your on-site responsibilities." />
      <AssignedProperties properties={properties} /></>;
  }
  const [data, params, assignments] = await Promise.all([apiServerStrict<OwnerPropertyTeam>('/property-team'), searchParams,
    session.access.roles.some(role => ['custodian', 'property_worker'].includes(role))
      ? apiServerStrict<AssignedProperty[]>('/property-team/mine') : Promise.resolve([])]);
  return <><PageHeader eyebrow="Property access" title="Property team"
    description="Assign custodians and workers at each property, or appoint a property manager with a management mandate." />
    <PropertyTeam key={params.propertyId ?? 'all'} data={data} initialPropertyId={params.propertyId} />
    {assignments.length > 0 && <section className="mt-8 space-y-4"><h2 className="text-xl font-semibold">Assignments to me</h2><AssignedProperties properties={assignments} /></section>}
  </>;
}
