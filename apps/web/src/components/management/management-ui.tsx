'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Check, LoaderCircle, ShieldCheck } from 'lucide-react';
import {
  MANAGEMENT_CAPABILITIES,
  MANAGEMENT_CAPABILITY_LABELS,
  type ManagementCapability,
} from '@campushomes/shared';
import { api, apiErrorMessage } from '@/lib/api';
import { Button } from '@/components/ui/button';

export const fieldClass =
  'min-h-11 w-full min-w-0 rounded-lg border border-border bg-background px-3 py-2 text-base text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring';
export function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="grid min-w-0 gap-1.5 text-sm font-medium">
      {label}
      {children}
    </label>
  );
}
export function Panel({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="min-w-0 rounded-xl border border-border bg-card p-4 [overflow-wrap:anywhere] sm:p-6">
      <h2 className="text-lg font-semibold">{title}</h2>
      {description && <p className="mt-1 text-sm text-muted-foreground">{description}</p>}
      <div className="mt-5">{children}</div>
    </section>
  );
}
export function StateBadge({ value }: { value: string }) {
  return (
    <span className="inline-flex max-w-full items-center gap-1.5 rounded-full border border-border bg-muted px-2.5 py-1 text-xs font-semibold capitalize">
      <span aria-hidden className="size-1.5 shrink-0 rounded-full bg-current" />
      {value.replaceAll('_', ' ')}
    </span>
  );
}
export function CapabilityPicker({
  value,
  onChange,
  allowed = MANAGEMENT_CAPABILITIES,
}: {
  value: ManagementCapability[];
  onChange: (v: ManagementCapability[]) => void;
  allowed?: readonly ManagementCapability[];
}) {
  return (
    <fieldset className="space-y-1">
      <legend className="mb-2 text-sm font-semibold">Delegated permissions</legend>
      {allowed.map((cap) => (
        <label
          key={cap}
          className="flex min-h-11 cursor-pointer items-center gap-3 rounded-lg px-2 py-2 hover:bg-muted"
        >
          <input
            type="checkbox"
            checked={value.includes(cap)}
            disabled={cap === 'property.read'}
            onChange={() =>
              onChange(value.includes(cap) ? value.filter((x) => x !== cap) : [...value, cap])
            }
            className="size-4 shrink-0 accent-teal-700 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ring"
          />
          <span className="text-sm">{MANAGEMENT_CAPABILITY_LABELS[cap]}</span>
        </label>
      ))}
    </fieldset>
  );
}
export function CapabilityList({ value }: { value: ManagementCapability[] }) {
  return (
    <ul className="flex flex-wrap gap-2">
      {value.map((cap) => (
        <li
          key={cap}
          className="inline-flex max-w-full items-center gap-1.5 rounded-md bg-muted px-2 py-1 text-xs"
        >
          <Check aria-hidden className="size-3 shrink-0" />
          <span className="min-w-0 break-words">{MANAGEMENT_CAPABILITY_LABELS[cap]}</span>
        </li>
      ))}
    </ul>
  );
}
export function useMutation() {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState('');
  const [failed, setFailed] = useState(false);
  async function run(path: string, method: string, body?: unknown) {
    setPending(true);
    setMessage('');
    setFailed(false);
    try {
      await api(path, { method, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
      setMessage('Changes saved.');
      router.refresh();
      return true;
    } catch (e) {
      setFailed(true);
      setMessage(apiErrorMessage(e, 'Could not save. Please try again.'));
      return false;
    } finally {
      setPending(false);
    }
  }
  return {
    pending,
    run,
    feedback: message ? (
      <p
        role={failed ? 'alert' : 'status'}
        className={
          failed
            ? 'rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive'
            : 'rounded-lg border border-border bg-muted p-3 text-sm'
        }
      >
        {message}
      </p>
    ) : null,
  };
}
export function SubmitButton({
  pending,
  children,
}: {
  pending: boolean;
  children: React.ReactNode;
}) {
  return (
    <Button
      type="submit"
      disabled={pending}
      className="h-auto min-h-11 max-w-full whitespace-normal py-2"
    >
      {pending ? (
        <LoaderCircle aria-hidden className="size-4 animate-spin motion-reduce:animate-none" />
      ) : (
        <ShieldCheck aria-hidden className="size-4" />
      )}
      {pending ? 'Saving…' : children}
    </Button>
  );
}
export function ConfirmAction({
  label,
  onConfirm,
  disabled = false,
}: {
  label: string;
  onConfirm: () => Promise<unknown>;
  disabled?: boolean;
}) {
  const [confirm, setConfirm] = useState(false);
  return confirm ? (
    <div className="flex flex-wrap items-center gap-2">
      <span className="text-sm">Confirm {label.toLowerCase()}?</span>
      <WorkflowButton
        type="button"
        variant="destructive"
        disabled={disabled}
        onClick={async () => {
          await onConfirm();
          setConfirm(false);
        }}
      >
        Confirm
      </WorkflowButton>
      <WorkflowButton
        type="button"
        variant="secondary"
        disabled={disabled}
        onClick={() => setConfirm(false)}
      >
        Cancel
      </WorkflowButton>
    </div>
  ) : (
    <WorkflowButton
      type="button"
      variant="secondary"
      disabled={disabled}
      onClick={() => setConfirm(true)}
    >
      {label}
    </WorkflowButton>
  );
}
export function Empty({ children }: { children: React.ReactNode }) {
  return (
    <p className="rounded-lg border border-dashed border-border p-6 text-sm leading-relaxed text-muted-foreground">
      {children}
    </p>
  );
}
export function formValues(form: HTMLFormElement) {
  return Object.fromEntries(new FormData(form).entries()) as Record<string, string>;
}
export const ugx = (value: number) =>
  new Intl.NumberFormat('en-UG', {
    style: 'currency',
    currency: 'UGX',
    maximumFractionDigits: 0,
  }).format(value);
export const dateTime = (value: string) =>
  new Intl.DateTimeFormat('en-UG', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: 'Africa/Kampala',
  }).format(new Date(value));

/** Keep horizontal tabs operable with arrows, Home and End as well as Tab. */
export function tabKeyNavigation(event: React.KeyboardEvent<HTMLElement>) {
  if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
  const tabs = Array.from(
    event.currentTarget.querySelectorAll<HTMLButtonElement>('button[role="tab"]'),
  );
  const index = tabs.indexOf(document.activeElement as HTMLButtonElement);
  if (index < 0 || !tabs.length) return;
  event.preventDefault();
  const next =
    event.key === 'Home'
      ? 0
      : event.key === 'End'
        ? tabs.length - 1
        : (index + (event.key === 'ArrowRight' ? 1 : -1) + tabs.length) % tabs.length;
  tabs[next]?.focus();
  tabs[next]?.click();
}

export function WorkflowButton({ className, ...props }: React.ComponentProps<typeof Button>) {
  return (
    <Button
      {...props}
      className={`h-auto min-h-11 max-w-full whitespace-normal py-2 ${className ?? ''}`}
    />
  );
}
