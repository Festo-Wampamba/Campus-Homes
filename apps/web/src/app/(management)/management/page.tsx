import { apiServerStrict } from '@/lib/server-api';
import { requireSession } from '@/lib/session';
import { PageHeader } from '@/components/admin/admin-ui';
import { ManagerDashboard, type ManagerPayload } from './manager-dashboard';
export const metadata = { title: 'Property management' };
export default async function ManagementPage() {
  const session = await requireSession('/management');
  const data = await apiServerStrict<ManagerPayload>('/management');
  return (
    <>
      <PageHeader
        eyebrow="Delegated property operations"
        title="Property management"
        description="Work within each landlord's authorisation, with a clear view of your assigned properties."
      />
      <ManagerDashboard data={data} enrolled={session.access.roles.includes('property_manager')} />
    </>
  );
}
