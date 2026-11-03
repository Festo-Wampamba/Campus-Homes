'use client';
import { ChevronRight, LockKeyhole, Save, Search, ShieldCheck, UserRound } from 'lucide-react';
import { useMemo, useState } from 'react';
import { api, apiErrorMessage } from '@/lib/api';
import { cn } from '@/lib/utils';
import { WorkflowButton as Button } from '@/components/management/management-ui';
import { fieldClass, StateBadge, tabKeyNavigation } from '@/components/management/management-ui';
interface RoleRow {
  id: string;
  key: string;
  name: string;
  description: string;
  isSystem: boolean;
  permissionCount: number;
  userCount: number;
}
interface PermissionRow {
  id: string;
  key: string;
  description: string;
  requiresStepUp: boolean;
}
interface RoleDetail extends RoleRow {
  permissionKeys: string[];
  assignedUsers: {
    assignmentId: string;
    id: string;
    name: string;
    email: string | null;
    status: string;
    scopeType: string;
    scopeId: string | null;
    validUntil: string | null;
  }[];
}
const GROUP_LABELS: Record<string, string> = {
  staff: 'Staff accounts',
  roles: 'Roles & permissions',
  students: 'Students',
  landlords: 'Landlords',
  kyc_documents: 'KYC documents',
  properties: 'Properties',
  visits: 'Verification visits',
  listings: 'Listings',
  listing_versions: 'Listing versions',
  reservations: 'Reservations',
  payments: 'Payments',
  refunds: 'Refunds',
  disputes: 'Disputes',
  strikes: 'Trust & strikes',
  accounts: 'Accounts',
  reviews: 'Reviews',
  chat: 'Chat',
  notifications: 'Notifications',
  templates: 'Templates',
  analytics: 'Analytics',
  audit: 'Audit log',
  semesters: 'Semesters',
  universities: 'Universities',
  settings: 'Platform settings',
  integrations: 'Integrations',
  users: 'User lifecycle',
  property_units: 'Property units',
  property_media: 'Property media',
  custodians: 'Custodians',
  workers: 'Property workers',
  tasks: 'Work orders',
  calendar: 'Calendars',
  incidents: 'Incidents',
  finance: 'Property finance',
  reports: 'Reports',
  service_requests: 'Service requests',
  notices: 'Property notices',
  evidence: 'Evidence',
  issues: 'Reported issues',
  units: 'Units',
  move_in: 'Move-in',
  executive: 'Executive reporting',
  governance: 'Business approvals',
  office: 'Front desk',
  management: 'Property management',
};
const BOUNDARIES: Record<string, { scope: string; purpose: string; limit: string }> = {
  director: {
    scope: 'Company oversight',
    purpose: 'Review company performance and independently approve significant business decisions.',
    limit: 'Approval does not execute a payment or grant technical access.',
  },
  general_manager: {
    scope: 'Platform or assigned catchment',
    purpose: 'Coordinate daily operations, department work and office escalations.',
    limit:
      'Financial exceptions go to a director. Verification and execution remain with authorised specialists.',
  },
  office_admin: {
    scope: 'Assigned cases and catchment',
    purpose: 'Capture inquiries, assist onboarding, arrange appointments and track follow-ups.',
    limit:
      'Case access does not grant bulk customer records, KYC approval, refunds or staff permissions.',
  },
  property_manager: {
    scope: 'Active property mandates',
    purpose: "Manage an owner's property as an individual or an assigned agency member.",
    limit:
      "The landlord's mandate and individual assignment determine each property's permissions. Ownership and payout details are excluded.",
  },
};
const propertyRoles = new Set([
  'landlord',
  'property_manager',
  'custodian',
  'property_worker',
  'student',
]);
export function RolesManager({
  roles,
  permissions,
  initialDetail,
  canEdit,
}: {
  roles: RoleRow[];
  permissions: PermissionRow[];
  initialDetail: RoleDetail;
  canEdit: boolean;
}) {
  const [detail, setDetail] = useState(initialDetail);
  const [selected, setSelected] = useState(new Set(initialDetail.permissionKeys));
  const [tab, setTab] = useState('permissions');
  const [pending, setPending] = useState(false);
  const [notice, setNotice] = useState('');
  const [query, setQuery] = useState('');
  const [grantedOnly, setGrantedOnly] = useState(false);
  const locked = detail.key === 'super_admin' || !canEdit;
  const dirty =
    selected.size !== detail.permissionKeys.length ||
    detail.permissionKeys.some((k) => !selected.has(k));
  const groups = useMemo(() => {
    const map = new Map<string, PermissionRow[]>();
    for (const p of permissions) {
      if (grantedOnly && !selected.has(p.key)) continue;
      if (query && !`${p.key} ${p.description}`.toLowerCase().includes(query.toLowerCase()))
        continue;
      const prefix = p.key.split('.')[0]!;
      map.set(prefix, [...(map.get(prefix) ?? []), p]);
    }
    return [...map.entries()];
  }, [permissions, query, grantedOnly, selected]);
  async function choose(key: string) {
    if (key === detail.key || pending) return;
    if (dirty) {
      setNotice('Save or discard your permission changes before choosing another role.');
      return;
    }
    setPending(true);
    setNotice('');
    try {
      const next = await api<RoleDetail>(`/admin/roles/${key}`);
      setDetail(next);
      setSelected(new Set(next.permissionKeys));
      setTab('permissions');
    } catch (e) {
      setNotice(apiErrorMessage(e, 'Could not load this role. Try again.'));
    } finally {
      setPending(false);
    }
  }
  async function save() {
    if (locked || pending || !dirty) return;
    setPending(true);
    setNotice('');
    const keys = [...selected];
    try {
      await api(`/admin/roles/${detail.key}/permissions`, {
        method: 'PATCH',
        body: JSON.stringify({ permissionKeys: keys }),
      });
      setDetail((d) => ({ ...d, permissionKeys: keys }));
      setNotice('Permission changes saved and audited.');
    } catch (e) {
      setNotice(apiErrorMessage(e, 'Could not save permission changes.'));
    } finally {
      setPending(false);
    }
  }
  const boundary = BOUNDARIES[detail.key];
  return (
    <div className="grid min-w-0 overflow-hidden rounded-xl border border-border bg-card shadow-sm lg:grid-cols-[270px_minmax(0,1fr)]">
      <aside className="min-w-0 border-b border-border bg-muted/25 p-4 lg:border-b-0 lg:border-r">
        <div className="mb-4">
          <p className="font-semibold">Access catalogue</p>
          <p className="mt-1 text-xs text-muted-foreground">
            {roles.length} roles · {permissions.length} permissions
          </p>
        </div>
        <label className="grid gap-2 text-sm font-medium lg:hidden">
          Choose a role
          <select
            aria-label="Choose a role"
            className={fieldClass}
            value={detail.key}
            disabled={pending}
            onChange={(e) => choose(e.target.value)}
          >
            {roles.map((r) => (
              <option key={r.key} value={r.key}>
                {r.name}
              </option>
            ))}
          </select>
        </label>
        <div className="hidden space-y-5 lg:block">
          {[
            {
              label: 'Company & operations',
              items: roles.filter((r) => !propertyRoles.has(r.key)),
            },
            {
              label: 'Property & customer roles',
              items: roles.filter((r) => propertyRoles.has(r.key)),
            },
          ].map((group) => (
            <div key={group.label}>
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                {group.label}
              </p>
              <div className="space-y-1">
                {group.items.map((r) => (
                  <button
                    type="button"
                    key={r.key}
                    aria-pressed={detail.key === r.key}
                    disabled={pending}
                    onClick={() => choose(r.key)}
                    className={cn(
                      'flex min-h-14 w-full items-center gap-3 rounded-lg border px-3 py-3 text-left focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:cursor-wait',
                      detail.key === r.key
                        ? 'border-primary/40 bg-background shadow-sm'
                        : 'border-transparent hover:bg-background',
                    )}
                  >
                    <ShieldCheck aria-hidden className="size-4 shrink-0 text-primary" />
                    <span className="min-w-0 flex-1">
                      <span className="block break-words text-sm font-semibold">{r.name}</span>
                      <span className="mt-1 block text-xs text-muted-foreground">
                        {r.userCount} users ·{' '}
                        {r.key === detail.key ? selected.size : r.permissionCount} grants
                      </span>
                    </span>
                    <ChevronRight aria-hidden className="size-3.5 shrink-0 text-muted-foreground" />
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      </aside>
      <div className="min-w-0" aria-busy={pending}>
        <div className="border-b border-border p-4 sm:p-6">
          <div className="flex items-start gap-3">
            <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-muted text-primary">
              <LockKeyhole aria-hidden className="size-5" />
            </span>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="break-words text-xl font-bold">{detail.name}</h2>
                {detail.isSystem && <StateBadge value="system role" />}
              </div>
              <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted-foreground">
                {detail.description}
              </p>
            </div>
          </div>
          {boundary && (
            <div className="mt-5 space-y-2 border-l-2 border-primary pl-4">
              <p className="text-sm font-semibold">{boundary.scope}</p>
              <p className="text-sm">{boundary.purpose}</p>
              <p className="text-xs leading-relaxed text-muted-foreground">{boundary.limit}</p>
            </div>
          )}
          <div
            className="mt-6 flex flex-wrap gap-2"
            role="tablist"
            onKeyDown={tabKeyNavigation}
            aria-label="Role detail"
          >
            {[
              { key: 'permissions', label: `Permissions (${selected.size})` },
              { key: 'users', label: `Assigned users (${detail.assignedUsers.length})` },
            ].map((t) => (
              <Button
                key={t.key}
                type="button"
                role="tab"
                tabIndex={tab === t.key ? 0 : -1}
                aria-selected={tab === t.key}
                aria-controls={`role-${t.key}`}
                id={`role-tab-${t.key}`}
                variant={tab === t.key ? 'primary' : 'secondary'}
                onClick={() => setTab(t.key)}
              >
                {t.label}
              </Button>
            ))}
          </div>
        </div>
        {notice && (
          <p
            role="status"
            className="mx-4 mt-4 rounded-lg border border-border bg-muted p-3 text-sm sm:mx-6"
          >
            {notice}
          </p>
        )}
        {tab === 'permissions' ? (
          <div
            role="tabpanel"
            id="role-permissions"
            aria-labelledby="role-tab-permissions"
            className="space-y-5 p-4 sm:p-6"
          >
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h3 className="font-semibold">Permission matrix</h3>
                <p className="mt-1 text-xs text-muted-foreground">
                  Sensitive changes require a fresh, MFA-verified sign-in within 8 hours.
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                {dirty && (
                  <Button
                    variant="secondary"
                    disabled={pending}
                    onClick={() => {
                      setSelected(new Set(detail.permissionKeys));
                      setNotice('');
                    }}
                  >
                    Discard changes
                  </Button>
                )}
                <Button disabled={locked || pending || !dirty} onClick={save}>
                  <Save aria-hidden />
                  {pending ? 'Please wait…' : dirty ? 'Save changes' : 'Saved'}
                </Button>
              </div>
            </div>
            {locked && (
              <p className="flex items-start gap-2 rounded-lg bg-muted p-3 text-sm text-muted-foreground">
                <LockKeyhole aria-hidden className="mt-0.5 size-4 shrink-0" />
                {detail.key === 'super_admin'
                  ? 'Super Admin always receives the complete permission catalogue.'
                  : 'You have read-only access to this matrix.'}
              </p>
            )}
            <div className="flex flex-wrap items-center gap-3">
              <label className="relative min-w-0 flex-1">
                <span className="sr-only">Search permissions</span>
                <Search
                  aria-hidden
                  className="absolute left-3 top-3.5 size-4 text-muted-foreground"
                />
                <input
                  type="search"
                  className={cn(fieldClass, 'pl-10')}
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search permissions"
                />
              </label>
              <label className="flex min-h-11 cursor-pointer items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={grantedOnly}
                  onChange={(e) => setGrantedOnly(e.target.checked)}
                  className="size-4 accent-teal-700"
                />
                Granted only
              </label>
            </div>
            <div className="grid items-start gap-4 xl:grid-cols-2">
              {groups.map(([prefix, items]) => (
                <section
                  key={prefix}
                  className="min-w-0 overflow-hidden rounded-lg border border-border"
                >
                  <div className="flex justify-between gap-2 border-b border-border bg-muted/30 px-4 py-3">
                    <h4 className="text-sm font-semibold">
                      {GROUP_LABELS[prefix] ?? prefix.replaceAll('_', ' ')}
                    </h4>
                    <span className="text-xs tabular-nums text-muted-foreground">
                      {items.filter((p) => selected.has(p.key)).length}/{items.length}
                    </span>
                  </div>
                  <div className="divide-y divide-border">
                    {items.map((p) => (
                      <label
                        key={p.key}
                        className={cn(
                          'flex min-h-14 gap-3 p-4',
                          !locked && 'cursor-pointer hover:bg-muted/40',
                        )}
                      >
                        <input
                          type="checkbox"
                          className="mt-1 size-4 shrink-0 accent-teal-700 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ring"
                          checked={selected.has(p.key)}
                          disabled={locked || pending}
                          onChange={() =>
                            setSelected((current) => {
                              const next = new Set(current);
                              if (next.has(p.key)) next.delete(p.key);
                              else next.add(p.key);
                              return next;
                            })
                          }
                        />
                        <span className="min-w-0">
                          <span className="block text-sm leading-relaxed">{p.description}</span>
                          <span className="mt-2 flex flex-wrap items-center gap-2">
                            <code className="break-all text-xs text-muted-foreground">{p.key}</code>
                            {p.requiresStepUp && (
                              <span className="rounded bg-muted px-1.5 py-0.5 text-[11px] font-semibold">
                                Fresh sign-in
                              </span>
                            )}
                          </span>
                        </span>
                      </label>
                    ))}
                  </div>
                </section>
              ))}
            </div>
            {!groups.length && (
              <p className="py-8 text-center text-sm text-muted-foreground">
                No permissions match these filters.
              </p>
            )}
          </div>
        ) : (
          <div
            role="tabpanel"
            id="role-users"
            aria-labelledby="role-tab-users"
            className="p-4 sm:p-6"
          >
            <div className="space-y-3">
              {detail.assignedUsers.map((u) => (
                <article
                  key={u.assignmentId}
                  className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border p-4"
                >
                  <div className="flex min-w-0 items-start gap-3">
                    <UserRound aria-hidden className="mt-1 size-4 shrink-0 text-muted-foreground" />
                    <div className="min-w-0">
                      <p className="break-words text-sm font-semibold">
                        {u.name || 'Unnamed user'}
                      </p>
                      <p className="break-all text-xs text-muted-foreground">
                        {u.email ?? 'No email'}
                      </p>
                    </div>
                  </div>
                  <StateBadge value={u.status} />
                  <p className="break-all text-xs text-muted-foreground">
                    {u.scopeType.replaceAll('_', ' ')}
                    {u.scopeId ? ` · ${u.scopeId}` : ''} ·{' '}
                    {u.validUntil
                      ? `Until ${new Date(u.validUntil).toLocaleDateString('en-UG')}`
                      : 'No expiry'}
                  </p>
                </article>
              ))}
              {!detail.assignedUsers.length && (
                <p className="py-10 text-center text-sm text-muted-foreground">
                  No active users hold this role.
                </p>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
