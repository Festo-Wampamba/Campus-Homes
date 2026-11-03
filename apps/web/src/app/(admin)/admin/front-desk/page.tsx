import { apiServerStrict } from '@/lib/server-api';
import { PageHeader } from '@/components/admin/admin-ui';
import { FrontDesk, type OfficePayload } from './front-desk';
export const metadata = { title: 'Front desk' };
export default async function FrontDeskPage() {
  const data = await apiServerStrict<OfficePayload>('/admin/office');
  return (
    <>
      <PageHeader
        eyebrow="Office operations"
        title="Front desk"
        description="Keep inquiries, onboarding and appointments moving. Escalate decisions that need a supervisor."
      />
      <FrontDesk data={data} />
    </>
  );
}
