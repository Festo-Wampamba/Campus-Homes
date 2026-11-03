import { apiServerStrict } from '@/lib/server-api';
import { PageHeader } from '@/components/admin/admin-ui';
import { OwnerManagement, type OwnerPayload } from './owner-management';
export const metadata = { title: 'Property managers' };
export default async function OwnerManagementPage({ searchParams }: { searchParams: Promise<{ propertyId?: string; new?: string }> }) {
  const [data, params] = await Promise.all([apiServerStrict<OwnerPayload>('/management/owner'), searchParams]);
  return (
    <>
      <PageHeader
        eyebrow="Property access"
        title="Property managers"
        description="Delegate specific responsibilities while retaining ownership and control of your properties."
      />
      <OwnerManagement key={`${params.propertyId ?? 'all'}:${params.new ?? ''}`} data={data} initialPropertyId={params.propertyId} startCreating={params.new === '1'} />
    </>
  );
}
