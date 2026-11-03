import { apiServerStrict, apiServer } from '@/lib/server-api';
import { requireWorkspace } from '@/lib/session';
import { PageHeader } from '@/components/admin/admin-ui';
import { Leadership, type LeadershipPayload, type DecisionRequest } from './leadership';
export const metadata = { title: 'Leadership' };
export default async function LeadershipPage() {
  const session = await requireWorkspace('admin');
  const [data, requests, access] = await Promise.all([
    apiServerStrict<LeadershipPayload>('/admin/leadership'),
    apiServer<DecisionRequest[]>('/admin/governance'),
    apiServerStrict<{ permissions: string[] }>('/admin/access/me'),
  ]);
  return (
    <>
      <PageHeader
        eyebrow="Business oversight"
        title="Leadership"
        description="Monitor the property portfolio, operational pressure and decisions awaiting approval."
      />
      <Leadership
        data={data}
        requests={requests ?? []}
        userId={session.user.id}
        canRequest={access.permissions.includes('governance.request')}
        canDecide={access.permissions.includes('governance.decide')}
      />
    </>
  );
}
