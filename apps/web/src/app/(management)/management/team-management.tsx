'use client';
import { useEffect, useState } from 'react';
import { assignManagerSchema, type ManagementCapability } from '@campushomes/shared';
import { api, apiErrorMessage } from '@/lib/api';
import { WorkflowButton as Button } from '@/components/management/management-ui';
import {
  CapabilityList,
  CapabilityPicker,
  ConfirmAction,
  Empty,
  Field,
  fieldClass,
  formValues,
  SubmitButton,
  useMutation,
} from '@/components/management/management-ui';
interface Member {
  id: string;
  userId: string;
  name: string;
  email: string;
  memberRole: string;
  agencyId?: string;
}
export function AgencyTeam({
  agency,
}: {
  agency: { id: string; name: string; memberRole: string };
}) {
  const [open, setOpen] = useState(false);
  const [members, setMembers] = useState<Member[]>([]);
  const [error, setError] = useState('');
  const [revision, setRevision] = useState(0);
  const mutation = useMutation();
  useEffect(() => {
    if (!open || agency.memberRole !== 'owner') return;
    const controller = new AbortController();
    api<Member[]>(`/management/agencies/${agency.id}/members`, { signal: controller.signal })
      .then(setMembers)
      .catch((e) => {
        if (!controller.signal.aborted)
          setError(apiErrorMessage(e, 'Could not load agency members.'));
      });
    return () => controller.abort();
  }, [open, agency.id, agency.memberRole, revision]);
  return (
    <div className="min-w-0 space-y-4 border-b border-border pb-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="break-words font-semibold">{agency.name}</h3>
          <p className="text-xs capitalize text-muted-foreground">{agency.memberRole}</p>
        </div>
        {agency.memberRole === 'owner' && (
          <Button
            type="button"
            variant="secondary"
            aria-expanded={open}
            onClick={() => setOpen(!open)}
          >
            {open ? 'Close members' : 'Manage members'}
          </Button>
        )}
      </div>
      {open && agency.memberRole === 'owner' && (
        <div className="space-y-4">
          {mutation.feedback}
          {error && (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}
          <form
            className="flex flex-wrap items-end gap-3"
            onSubmit={async (e) => {
              e.preventDefault();
              const form = e.currentTarget;
              const v = formValues(form);
              if (await mutation.run(`/management/agencies/${agency.id}/members`, 'POST', v)) {
                form.reset();
                setRevision((r) => r + 1);
              }
            }}
          >
            <div className="min-w-0 flex-1">
              <Field label="Member's registered email">
                <input name="email" type="email" required className={fieldClass} />
              </Field>
            </div>
            <SubmitButton pending={mutation.pending}>Add member</SubmitButton>
          </form>
          <p className="text-xs text-muted-foreground">
            Members enable their own management workspace at /management before receiving property
            assignments.
          </p>
          <ul className="space-y-3">
            {members.map((m) => (
              <li
                key={m.id}
                className="flex flex-wrap items-center justify-between gap-3 rounded-lg bg-muted p-3"
              >
                <div className="min-w-0">
                  <p className="break-words text-sm font-medium">{m.name || m.email}</p>
                  <p className="break-words text-xs text-muted-foreground">
                    {m.email} · {m.memberRole}
                  </p>
                </div>
                {m.memberRole !== 'owner' && (
                  <ConfirmAction
                    label="Remove member"
                    onConfirm={async () => {
                      if (
                        await mutation.run(
                          `/management/agencies/${agency.id}/members/${m.id}`,
                          'DELETE',
                        )
                      )
                        setRevision((r) => r + 1);
                    }}
                  />
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
interface Team {
  actorUserId: string;
  mandates: {
    id: string;
    agencyName: string;
    agencyId: string;
    capabilities: ManagementCapability[];
  }[];
  members: Member[];
  assignments: {
    id: string;
    mandateId: string;
    userId: string;
    name: string;
    capabilities: ManagementCapability[];
  }[];
}
export function PropertyTeam({ propertyId, revision }: { propertyId: string; revision: string }) {
  const [data, setData] = useState<Team | null>(null);
  const [error, setError] = useState('');
  const [mandateId, setMandateId] = useState('');
  const [caps, setCaps] = useState<ManagementCapability[]>(['property.read']);
  const [localRevision, setLocalRevision] = useState(0);
  const mutation = useMutation();
  useEffect(() => {
    const controller = new AbortController();
    api<Team>(`/management/properties/${propertyId}/team`, { signal: controller.signal })
      .then(setData)
      .catch((e) => {
        if (!controller.signal.aborted)
          setError(apiErrorMessage(e, 'Could not load property team.'));
      });
    return () => controller.abort();
  }, [propertyId, revision, localRevision]);
  const mandate = data?.mandates.find((m) => m.id === mandateId) ?? data?.mandates[0];
  return (
    <div className="space-y-5">
      {mutation.feedback}
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      {!data && !error && <p role="status">Loading property team…</p>}
      {data &&
        (!mandate ? (
          <Empty>
            This mandate is for an individual manager. Agency team assignments require an agency
            mandate.
          </Empty>
        ) : (
          <>
            <form
              className="space-y-4"
              onSubmit={async (e) => {
                e.preventDefault();
                const v = formValues(e.currentTarget);
                const parsed = assignManagerSchema.safeParse({
                  userId: v.userId,
                  capabilities: caps.filter((c) => mandate.capabilities.includes(c)),
                });
                if (!parsed.success) {
                  setError(parsed.error.issues[0]?.message ?? 'Check this assignment');
                  return;
                }
                if (
                  await mutation.run(
                    `/management/mandates/${mandate.id}/assignments`,
                    'POST',
                    parsed.data,
                  )
                )
                  setLocalRevision((v) => v + 1);
              }}
            >
              <Field label="Agency mandate">
                <select
                  className={fieldClass}
                  value={mandate.id}
                  onChange={(e) => {
                    setMandateId(e.target.value);
                    setCaps(['property.read']);
                  }}
                >
                  {data.mandates.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.agencyName}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Agency member">
                <select name="userId" required className={fieldClass}>
                  <option value="">Choose a member</option>
                  {data.members
                    .filter((m) => m.agencyId === mandate.agencyId && m.userId !== data.actorUserId)
                    .map((m) => (
                      <option key={m.id} value={m.userId}>
                        {m.name || m.email}
                      </option>
                    ))}
                </select>
              </Field>
              <CapabilityPicker allowed={mandate.capabilities} value={caps} onChange={setCaps} />
              <SubmitButton pending={mutation.pending}>Save property assignment</SubmitButton>
            </form>
            <ul className="space-y-4">
              {data.assignments.map((a) => (
                <li key={a.id} className="space-y-3 rounded-lg border border-border p-3">
                  <h3 className="font-semibold">{a.name}</h3>
                  <CapabilityList value={a.capabilities} />
                  <ConfirmAction
                    disabled={mutation.pending || a.userId === data.actorUserId}
                    label="Revoke assignment"
                    onConfirm={async () => {
                      if (await mutation.run(`/management/assignments/${a.id}`, 'DELETE'))
                        setLocalRevision((v) => v + 1);
                    }}
                  />
                </li>
              ))}
            </ul>
          </>
        ))}
    </div>
  );
}
