import { Building2, Users } from 'lucide-react';
import { AppShell } from '@/components/shell/app-shell';
import { requireSession } from '@/lib/session';
export default async function ManagementLayout({ children }: { children: React.ReactNode }) {
  const session = await requireSession('/management');
  return (
    <AppShell
      user={session.user}
      access={session.access}
      portalLabel="Property management"
      homeHref="/management"
      profileHref="/onboarding?next=%2Fmanagement"
      nav={[
        {
          label: 'Managed properties',
          href: '/management',
          icon: <Building2 aria-hidden className="size-4" />,
        },
        ...(session.access.workspaces.length > 1 ? [{
          label: 'Switch workspace',
          href: '/choose-workspace',
          icon: <Users aria-hidden className="size-4" />,
        }] : []),
      ]}
    >
      {children}
    </AppShell>
  );
}
