import { apiServerStrict } from '@/lib/server-api';
import { PageHeader } from '@/components/admin/admin-ui';
import { OwnerManagement, type OwnerPayload } from './owner-management';
export const metadata = { title: 'Property managers' };
export default async function OwnerManagementPage() {
  const data = await apiServerStrict<OwnerPayload>('/management/owner');
  return (
    <>
      <PageHeader
        eyebrow="Property access"
        title="Property managers"
        description="Delegate specific responsibilities while retaining ownership and control of your properties."
      />
      <OwnerManagement data={data} />
    </>
  );
}
