# Landlord Onboarding UX Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A landlord journey that only shows landlord choices, cannot reach the dashboard before KYC approval by any navigation path, moves itself into the dashboard when approved, and presents roomier, resizable forms and an organised Account Settings page.

**Architecture:** Onboarding and the approval wait move to a new `(landlord-setup)` route group with a bare layout, so entering `/landlord` always mounts the `(landlord)` dashboard layout fresh and its KYC gate always runs. Gate decisions, poll cadence and copy live in small pure functions with unit tests; the client polls the existing `GET /landlords/me`. One API addition (`hasLiveListing` on `GET /listings/properties/mine`) lets the banner tell "verified" from "inspected and live".

**Tech Stack:** Next.js 16 App Router (`proxy.ts`), React 19.2, Tailwind v4 (CSS-first, `@theme`), Jest 30 with `renderToStaticMarkup` (no Testing Library in this repo), NestJS 11 + Drizzle + Postgres RLS, pnpm workspace, Node 24.

**Spec:** `docs/superpowers/specs/2026-10-05-landlord-onboarding-ux-design.md`

## Global Constraints

- Work only in `/home/festo/Campus-Homes/.worktrees/landlord-onboarding-ux` on branch `feat/landlord-onboarding-ux`. Never edit `/home/festo/Campus-Homes` directly.
- Node 24 (`source ~/.nvm/nvm.sh && nvm use 24`) and pnpm, never npm.
- API tests run only against the disposable local test DB: `TEST_DATABASE_URL=postgresql://campushomes:campushomes_test@127.0.0.1:54329/campushomes_test` (container `api-db-1`). Never the dev DB (25432), staging or prod.
- No new dependencies. No database migrations (`drizzle-kit check` must stay clean).
- Usernames stay stored exactly as today; only the "@" display is removed.
- Any new SQL touching RLS-policied tables: one policied table per statement — never a join or correlated subquery across them (2026-09-23 rule).
- Support email is exactly `support@campushomes.co.ug`.
- Copy strings below are verbatim from the spec. Do not reword them.
- Tests: one behaviour per test, Arrange-Act-Assert, no `if`/loops in tests (`it.each` is fine).
- Commit after every task with a conventional message (`feat:`, `fix:`, `refactor:`, `test:`).
- Deviations from the spec, decided here (record them in the PR body):
  1. The "alternative name" field stays a single-line input (it is a short name); only the landmark/location field becomes a resizable textarea.
  2. "Poll returning verified calls `router.replace`", "wizard success navigates to the review page" and "reduced motion disables the stamp" are verified by pure-function tests plus the browser check in Task 11, because the repo has no interactive React test harness. Reduced motion is enforced by Tailwind's `motion-safe:` variant, which the markup test asserts.

## Review Focus

1. **A landlord who stops after step 1** (legal name saved, no property yet) and comes back must land on onboarding, not on "under review" — Task 3 `setupGate` test "profile without a property on the approval page goes to onboarding".
2. **A verified landlord whose properties were all removed** must not loop between `/landlord` and onboarding — Task 3 tests "verified without a property may stay on onboarding" and "verified landlord on the dashboard is not redirected".
3. **A rejected landlord deep-linking `/landlord/bookings`** must see the rejection on the review page, not the dashboard — Task 3 test "rejected landlord with a property is sent to the review page".
4. **Network loss while waiting** must keep the last state and slow retries instead of hammering the API or crashing — Task 4 `pollDelay` tests (5 s, then 15 s after 3 failures) plus the trouble copy rendered by Task 5.
5. **Another landlord's live listing** must never mark this landlord's property as live — Task 6 test "never returns another landlord's property".

---

### Task 1: Usernames without "@"

**Files:**
- Modify: `apps/web/src/app/onboarding/onboarding-form.tsx:53` (delete the `@` adornment span)
- Modify: `apps/web/src/components/shell/app-shell.tsx:365`
- Test: `apps/web/src/app/onboarding/onboarding-form.test.tsx` (create)

**Interfaces:** none consumed or produced.

- [ ] **Step 1: Write the failing test**

```tsx
// apps/web/src/app/onboarding/onboarding-form.test.tsx
import { renderToStaticMarkup } from "react-dom/server";

import { OnboardingForm } from "./onboarding-form";

jest.mock("next/navigation", () => ({
  useRouter: () => ({ push: jest.fn(), replace: jest.fn(), refresh: jest.fn() }),
}));

describe("OnboardingForm", () => {
  it("shows the username field without an @ prefix", () => {
    const html = renderToStaticMarkup(<OnboardingForm initialName="Jane Doe" initialUsername="janedoe" />);

    expect(html).not.toContain(">@<");
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `cd apps/web && pnpm jest src/app/onboarding/onboarding-form.test.tsx`
Expected: FAIL — received markup contains `>@<`.

- [ ] **Step 3: Remove both "@" renders**

In `onboarding-form.tsx` delete this line (keep the wrapper `div` and the `input`):

```tsx
          <span aria-hidden className="text-sm text-muted-foreground">@</span>
```

In `app-shell.tsx` line 365 change `@{user.username}` to `{user.username}`:

```tsx
                    {user.username && <p className="truncate text-xs text-teal-700 dark:text-teal-300">{user.username}</p>}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd apps/web && pnpm jest src/app/onboarding/onboarding-form.test.tsx`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/app/onboarding/onboarding-form.tsx apps/web/src/app/onboarding/onboarding-form.test.tsx apps/web/src/components/shell/app-shell.tsx
git commit -m "fix(web): show usernames without an @ prefix"
```

---

### Task 2: Sign-in screen landlord mode

**Files:**
- Modify: `apps/web/src/app/(auth)/sign-in/sign-in-form.tsx`
- Test: `apps/web/src/app/(auth)/sign-in/sign-in-form.test.tsx` (extend)

**Interfaces:**
- Produces: `export type SignInMode = "landlord-create" | "landlord-signin" | "all"` and `export function signInMode(next: string | null): SignInMode` from `sign-in-form.tsx`.

- [ ] **Step 1: Write the failing tests** (change the existing import to `import { SignInForm, signInMode } from "./sign-in-form";` and append)

```tsx
describe("signInMode", () => {
  it.each([
    ["/landlords/enroll", "landlord-create"],
    ["/landlord", "landlord-signin"],
    ["/landlord/bookings", "landlord-signin"],
    ["/landlords", "all"],
    [null, "all"],
  ])("maps next=%s to %s", (next, mode) => {
    expect(signInMode(next)).toBe(mode);
  });
});

describe("SignInForm landlord mode", () => {
  it("offers only landlord account creation when coming to enrol", () => {
    expect(renderToStaticMarkup(<SignInForm next="/landlords/enroll" />)).toContain("Create landlord account");
  });

  it("hides student housing when coming to enrol", () => {
    expect(renderToStaticMarkup(<SignInForm next="/landlords/enroll" />)).not.toContain("Find student housing");
  });

  it("hides staff workspaces when coming to enrol", () => {
    expect(renderToStaticMarkup(<SignInForm next="/landlords/enroll" />)).not.toContain("Administration");
  });

  it("offers sign-in to manage properties when coming to the dashboard", () => {
    expect(renderToStaticMarkup(<SignInForm next="/landlord" />)).toContain("Sign in to manage my properties");
  });

  it("keeps a landlord deep link as the sign-in destination", () => {
    expect(renderToStaticMarkup(<SignInForm next="/landlord/bookings" />)).toContain("next=%2Flandlord%2Fbookings");
  });

  it("hides student housing when coming to the dashboard", () => {
    expect(renderToStaticMarkup(<SignInForm next="/landlord" />)).not.toContain("Find student housing");
  });

  it("links an enrolling landlord to the sign-in variant", () => {
    expect(renderToStaticMarkup(<SignInForm next="/landlords/enroll" />)).toContain('href="/sign-in?next=%2Flandlord"');
  });

  it("keeps the full chooser without a landlord destination", () => {
    expect(renderToStaticMarkup(<SignInForm next={null} />)).toContain("Find student housing");
  });
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `cd apps/web && pnpm jest "src/app/(auth)/sign-in/sign-in-form.test.tsx"`
Expected: FAIL — `signInMode` is not exported.

- [ ] **Step 3: Implement landlord mode**

In `sign-in-form.tsx`, add above `SignInForm`:

```tsx
export type SignInMode = "landlord-create" | "landlord-signin" | "all";

// The public landlords page sends exactly these two destinations; anything
// else keeps the full workspace chooser.
export function signInMode(next: string | null): SignInMode {
  if (next === "/landlords/enroll") return "landlord-create";
  if (next === "/landlord" || next?.startsWith("/landlord/")) return "landlord-signin";
  return "all";
}

function ErrorNotice({ error }: { error?: string | null }) {
  if (!error || !ERROR_MESSAGES[error]) return null;
  return (
    <p role="alert" className="mb-4 rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-center text-xs text-destructive">
      {ERROR_MESSAGES[error]}
    </p>
  );
}

function TermsNote() {
  return (
    <p className="mt-4 text-center text-[10px] leading-relaxed text-muted-foreground">
      By continuing you agree to our{" "}
      <Link href="/terms" className="font-semibold underline underline-offset-2">Terms</Link> and{" "}
      <Link href="/privacy" className="font-semibold underline underline-offset-2">Privacy policy</Link>.
    </p>
  );
}

function LandlordSignIn({ mode, next, error }: { mode: Exclude<SignInMode, "all">; next: string; error?: string | null }) {
  const creating = mode === "landlord-create";
  return (
    <Card className="w-full max-w-md shadow-xl">
      <CardContent className="p-4 sm:p-6">
        <div className="mb-3 flex flex-col items-center gap-1 sm:mb-4">
          <Wordmark stacked />
        </div>
        <p className="mb-5 text-center text-sm text-muted-foreground">
          Landlord account — list and manage your properties on CampusHomes.
        </p>
        <ErrorNotice error={error} />
        <a href={signInUrl("consumer", creating ? "/landlords/enroll" : next, "landlord")} className="block">
          <Button type="button" className="w-full gap-2">
            <ArrowRightIcon aria-hidden />
            {creating ? "Create landlord account" : "Sign in to manage my properties"}
          </Button>
        </a>
        <p className="mt-4 text-center text-sm text-muted-foreground">
          {creating ? (
            <Link href="/sign-in?next=%2Flandlord" className="font-semibold text-primary underline-offset-2 hover:underline">
              Already have an account? Sign in
            </Link>
          ) : (
            <Link href="/sign-in?next=%2Flandlords%2Fenroll" className="font-semibold text-primary underline-offset-2 hover:underline">
              New landlord? Create an account
            </Link>
          )}
        </p>
        <TermsNote />
      </CardContent>
    </Card>
  );
}
```

At the top of `SignInForm`'s body add:

```tsx
  const mode = signInMode(next);
  if (mode !== "all") return <LandlordSignIn mode={mode} next={next ?? "/landlord"} error={error} />;
```

Then replace the inline error `{error && ERROR_MESSAGES[error] && (...)}` block with `<ErrorNotice error={error} />` and the trailing terms `<p>` with `<TermsNote />`.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd apps/web && pnpm jest "src/app/(auth)/sign-in/sign-in-form.test.tsx"`
Expected: PASS (including the two pre-existing staff tests).

- [ ] **Step 5: Commit**

```bash
git add "apps/web/src/app/(auth)/sign-in/"
git commit -m "feat(web): landlord-only sign-in options from the landlords page"
```

---

### Task 3: Approval gate — pure gate functions and route-group split

**Files:**
- Create: `apps/web/src/lib/landlord-gate.ts`
- Test: `apps/web/src/lib/landlord-gate.test.ts`
- Move: `apps/web/src/app/(landlord)/landlord/onboarding/` → `apps/web/src/app/(landlord-setup)/landlord/onboarding/`
- Move: `apps/web/src/app/(landlord)/landlord/approval-pending/` → `apps/web/src/app/(landlord-setup)/landlord/approval-pending/`
- Create: `apps/web/src/app/(landlord-setup)/layout.tsx`
- Modify: `apps/web/src/app/(landlord)/layout.tsx`
- Modify: `apps/web/src/app/(landlord-setup)/landlord/onboarding/page.tsx`
- Modify: `apps/web/src/app/(landlord-setup)/landlord/onboarding/onboarding-wizard.tsx` (success path)
- Modify: `apps/web/src/app/(landlord)/landlord/page.tsx` (drop the orphaned `?submitted=property` notice)

**Interfaces:**
- Produces (from `@/lib/landlord-gate`):
  - `export const ONBOARDING_PATH = "/landlord/onboarding"`
  - `export const APPROVAL_PATH = "/landlord/approval-pending"`
  - `export type GateProfile = { kycStatus: "pending" | "verified" | "rejected" } | null`
  - `export function dashboardGate(profile: GateProfile, hasProperty: boolean): string | null`
  - `export function setupGate(profile: GateProfile, hasProperty: boolean, path: string): string | null`
  - Return value: a path to redirect to, or `null` to stay.

- [ ] **Step 1: Write the failing tests**

```ts
// apps/web/src/lib/landlord-gate.test.ts
import { APPROVAL_PATH, ONBOARDING_PATH, dashboardGate, setupGate } from "./landlord-gate";

const pending = { kycStatus: "pending" as const };
const verified = { kycStatus: "verified" as const };
const rejected = { kycStatus: "rejected" as const };

describe("dashboardGate", () => {
  it("sends a landlord without a profile to onboarding", () => {
    expect(dashboardGate(null, false)).toBe(ONBOARDING_PATH);
  });

  it("sends a pending landlord with a property to the review page", () => {
    expect(dashboardGate(pending, true)).toBe(APPROVAL_PATH);
  });

  it("sends a pending landlord without a property back to onboarding", () => {
    expect(dashboardGate(pending, false)).toBe(ONBOARDING_PATH);
  });

  it("rejected landlord with a property is sent to the review page", () => {
    expect(dashboardGate(rejected, true)).toBe(APPROVAL_PATH);
  });

  it("verified landlord on the dashboard is not redirected", () => {
    expect(dashboardGate(verified, false)).toBeNull();
  });
});

describe("setupGate", () => {
  it("lets a new landlord stay on onboarding", () => {
    expect(setupGate(null, false, ONBOARDING_PATH)).toBeNull();
  });

  it("profile without a property on the approval page goes to onboarding", () => {
    expect(setupGate(pending, false, APPROVAL_PATH)).toBe(ONBOARDING_PATH);
  });

  it("sends a submitted pending landlord from onboarding to the review page", () => {
    expect(setupGate(pending, true, ONBOARDING_PATH)).toBe(APPROVAL_PATH);
  });

  it("keeps a submitted pending landlord on the review page", () => {
    expect(setupGate(pending, true, `${APPROVAL_PATH}?x=1`)).toBeNull();
  });

  it("sends a verified landlord on the review page to the dashboard", () => {
    expect(setupGate(verified, true, APPROVAL_PATH)).toBe("/landlord");
  });

  it("verified without a property may stay on onboarding", () => {
    expect(setupGate(verified, false, ONBOARDING_PATH)).toBeNull();
  });
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `cd apps/web && pnpm jest src/lib/landlord-gate.test.ts`
Expected: FAIL — cannot find module `./landlord-gate`.

- [ ] **Step 3: Implement the gate functions**

```ts
// apps/web/src/lib/landlord-gate.ts

// Where a landlord must be sent instead of the page they asked for, or null
// to let them stay. Kept pure so every combination is unit-tested: the two
// layouts are thin callers.
export const ONBOARDING_PATH = "/landlord/onboarding";
export const APPROVAL_PATH = "/landlord/approval-pending";

export type GateProfile = { kycStatus: "pending" | "verified" | "rejected" } | null;

export function dashboardGate(profile: GateProfile, hasProperty: boolean): string | null {
  if (!profile) return ONBOARDING_PATH;
  if (profile.kycStatus !== "verified") return hasProperty ? APPROVAL_PATH : ONBOARDING_PATH;
  // A verified landlord with no property is handled by the dashboard page
  // itself (it opens onboarding), which setupGate lets them stay on.
  return null;
}

export function setupGate(profile: GateProfile, hasProperty: boolean, path: string): string | null {
  const onApproval = path.startsWith(APPROVAL_PATH);
  if (profile?.kycStatus === "verified") return onApproval || hasProperty ? "/landlord" : null;
  if (onApproval) return profile && hasProperty ? null : ONBOARDING_PATH;
  return profile && hasProperty ? APPROVAL_PATH : null;
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd apps/web && pnpm jest src/lib/landlord-gate.test.ts`
Expected: PASS (11 tests)

- [ ] **Step 5: Move the two setup routes into the new group**

```bash
mkdir -p "apps/web/src/app/(landlord-setup)/landlord"
git mv "apps/web/src/app/(landlord)/landlord/onboarding" "apps/web/src/app/(landlord-setup)/landlord/onboarding"
git mv "apps/web/src/app/(landlord)/landlord/approval-pending" "apps/web/src/app/(landlord-setup)/landlord/approval-pending"
```

- [ ] **Step 6: Create the bare setup layout**

```tsx
// apps/web/src/app/(landlord-setup)/layout.tsx
import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { SignOutButton } from "@/components/shell/sign-out-button";
import { Wordmark } from "@/components/shell/wordmark";
import { getLandlordProfile, getMyProperties } from "@/lib/landlord";
import { ONBOARDING_PATH, setupGate } from "@/lib/landlord-gate";
import { requireWorkspace } from "@/lib/session";

// Onboarding and the approval wait live outside the dashboard shell on
// purpose: entering /landlord from here mounts the (landlord) layout fresh,
// so its KYC gate always runs. When both shared one layout, the wizard's
// client-side navigation skipped the gate and pending landlords reached the
// dashboard.
export default async function LandlordSetupLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  await requireWorkspace("landlord");
  const path = (await headers()).get("x-campushomes-path") ?? ONBOARDING_PATH;
  const [profile, properties] = await Promise.all([getLandlordProfile(), getMyProperties()]);
  const destination = setupGate(profile, properties.length > 0, path);
  if (destination) redirect(destination);

  return (
    <div className="flex min-h-dvh flex-col bg-muted/30">
      <header className="flex items-center justify-between border-b border-border bg-background px-4 py-3 sm:px-6">
        <Wordmark />
        <SignOutButton />
      </header>
      <main className="flex flex-1 flex-col">{children}</main>
    </div>
  );
}
```

If `Wordmark` requires props, check `apps/web/src/components/shell/wordmark.tsx` and pass the minimal ones (the sign-in page uses `<Wordmark stacked />`; the header wants the inline variant).

- [ ] **Step 7: Simplify the dashboard layout gate**

In `apps/web/src/app/(landlord)/layout.tsx` replace the body from `const session = ...` through the second `redirect(...)` with:

```tsx
  const session = await requireWorkspace("landlord");
  const [profile, properties] = await Promise.all([getLandlordProfile(), getMyProperties()]);
  // Onboarding and approval-pending render under (landlord-setup), so every
  // path here is a dashboard surface. The API enforces the same boundary.
  const destination = dashboardGate(profile, properties.length > 0);
  if (destination) redirect(destination);
```

Update imports: remove `headers` from `next/headers`; import `getMyProperties` from `@/lib/landlord` and `dashboardGate` from `@/lib/landlord-gate`.

- [ ] **Step 8: Remove the onboarding page's own redirect (the layout owns it now)**

Replace `apps/web/src/app/(landlord-setup)/landlord/onboarding/page.tsx` with:

```tsx
import type { Metadata } from "next";

import { getLandlordProfile } from "@/lib/landlord";
import { OnboardingWizard } from "./onboarding-wizard";

export const metadata: Metadata = { title: "Landlord onboarding" };

export default async function OnboardingPage() {
  const profile = await getLandlordProfile();
  const initialStep = !profile ? "legal" : "property";

  return (
    <div className="flex flex-1 items-start justify-center px-4 py-10 sm:px-8">
      <OnboardingWizard initialProfile={profile} initialStep={initialStep} />
    </div>
  );
}
```

- [ ] **Step 9: Send a finished wizard to the review page**

In `onboarding-wizard.tsx`, in the property submit success branch replace:

```tsx
      setSubmitted(true);
      router.refresh();
```

with:

```tsx
      router.replace(APPROVAL_PATH);
```

Delete the `submitted` state (`const [submitted, setSubmitted] = useState(false);`), the whole `if (submitted) { return (...) }` block, the now-unused `CheckCircle2` import, and the comment line above it about `refresh()`. Add `import { APPROVAL_PATH } from "@/lib/landlord-gate";`.

- [ ] **Step 10: Drop the orphaned "submitted" notice on the dashboard**

In `apps/web/src/app/(landlord)/landlord/page.tsx` delete `const submitted = (await searchParams).submitted === "property";`, the `{submitted && (...)}` block, and the `searchParams` prop from the page signature (and `CheckCircle2` if now unused).

- [ ] **Step 11: Verify**

Run: `cd apps/web && pnpm jest src/lib/landlord-gate.test.ts && pnpm typecheck && pnpm lint`
Expected: PASS / no errors. `grep -rn "landlord?submitted" src` returns nothing.

- [ ] **Step 12: Commit**

```bash
git add -A apps/web/src/lib/landlord-gate.ts apps/web/src/lib/landlord-gate.test.ts "apps/web/src/app/(landlord-setup)" "apps/web/src/app/(landlord)"
git commit -m "fix(web): gate the landlord dashboard on every entry until KYC approval

Onboarding and approval-pending move to a bare (landlord-setup) route group.
Sharing the (landlord) layout let the wizard's client navigation skip the
layout's KYC gate, so pending landlords reached the dashboard."
```

---

### Task 4: Approval status logic and polling hook

**Files:**
- Create: `apps/web/src/app/(landlord-setup)/landlord/approval-pending/approval-status.ts`
- Test: `apps/web/src/app/(landlord-setup)/landlord/approval-pending/approval-status.test.ts`
- Create: `apps/web/src/app/(landlord-setup)/landlord/approval-pending/use-approval-status.ts`

**Interfaces:**
- Produces:
  - `export type ApprovalStatus = "pending" | "verified" | "rejected"`
  - `export const POLL_MS = 5_000`, `export const SLOW_POLL_MS = 15_000`, `export const FAILURES_BEFORE_SLOWDOWN = 3`
  - `export function isFinal(status: ApprovalStatus): boolean`
  - `export function pollDelay(consecutiveFailures: number): number`
  - `export function useApprovalStatus(initial: ApprovalStatus): { status: ApprovalStatus; hasTrouble: boolean }`
- Consumes: `api`, `ApiError` from `@/lib/api` (`ApiError.status: number`).

- [ ] **Step 1: Write the failing tests**

```ts
// approval-status.test.ts
import { POLL_MS, SLOW_POLL_MS, isFinal, pollDelay } from "./approval-status";

describe("pollDelay", () => {
  it("polls every 5 seconds while healthy", () => {
    expect(pollDelay(0)).toBe(POLL_MS);
  });

  it("keeps 5 seconds after two failures", () => {
    expect(pollDelay(2)).toBe(POLL_MS);
  });

  it("slows to 15 seconds after three consecutive failures", () => {
    expect(pollDelay(3)).toBe(SLOW_POLL_MS);
  });
});

describe("isFinal", () => {
  it.each([
    ["pending", false],
    ["verified", true],
    ["rejected", true],
  ] as const)("%s is final: %s", (status, expected) => {
    expect(isFinal(status)).toBe(expected);
  });
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `cd apps/web && pnpm jest "src/app/(landlord-setup)/landlord/approval-pending/approval-status.test.ts"`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the pure module**

```ts
// approval-status.ts
export type ApprovalStatus = "pending" | "verified" | "rejected";

export const POLL_MS = 5_000;
export const SLOW_POLL_MS = 15_000;
export const FAILURES_BEFORE_SLOWDOWN = 3;

export function isFinal(status: ApprovalStatus): boolean {
  return status !== "pending";
}

// Back off when the API keeps failing so a dropped connection doesn't turn
// every open review tab into a tight retry loop.
export function pollDelay(consecutiveFailures: number): number {
  return consecutiveFailures >= FAILURES_BEFORE_SLOWDOWN ? SLOW_POLL_MS : POLL_MS;
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: same command as Step 2. Expected: PASS (6 tests).

- [ ] **Step 5: Implement the hook**

```ts
// use-approval-status.ts
"use client";

import { useEffect, useRef, useState } from "react";

import { ApiError, api } from "@/lib/api";
import { isFinal, pollDelay, type ApprovalStatus } from "./approval-status";

// ponytail: short polling, not push — Soketi isn't provisioned. Swap for a
// realtime subscription once it is; the page only reads { status }.
export function useApprovalStatus(initial: ApprovalStatus) {
  const [status, setStatus] = useState(initial);
  const [hasTrouble, setHasTrouble] = useState(false);
  const failures = useRef(0);

  useEffect(() => {
    if (isFinal(status)) return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let cancelled = false;

    function schedule() {
      clearTimeout(timer);
      timer = setTimeout(check, pollDelay(failures.current));
    }

    async function check() {
      // Hidden tabs stop polling; visibilitychange/focus restarts it.
      if (document.visibilityState === "hidden") return;
      try {
        const profile = await api<{ kycStatus: ApprovalStatus }>("/landlords/me");
        if (cancelled) return;
        failures.current = 0;
        setHasTrouble(false);
        setStatus(profile.kycStatus);
      } catch (err) {
        if (cancelled) return;
        if (err instanceof ApiError && err.status === 401) {
          window.location.assign("/sign-in?next=%2Flandlord%2Fapproval-pending");
          return;
        }
        failures.current += 1;
        setHasTrouble(true);
      }
      schedule();
    }

    function onVisible() {
      if (document.visibilityState !== "visible") return;
      clearTimeout(timer);
      void check();
    }

    schedule();
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", onVisible);
    return () => {
      cancelled = true;
      clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", onVisible);
    };
  }, [status]);

  return { status, hasTrouble };
}
```

- [ ] **Step 6: Verify**

Run: `cd apps/web && pnpm typecheck && pnpm lint`
Expected: no errors (the hook is exercised in Task 5 and the Task 11 browser check).

- [ ] **Step 7: Commit**

```bash
git add "apps/web/src/app/(landlord-setup)/landlord/approval-pending/"
git commit -m "feat(web): poll landlord approval status with backoff"
```

---

### Task 5: "Under review" page with the stamp animation

**Files:**
- Modify: `apps/web/src/app/globals.css` (add a `@theme` block with two animations)
- Create: `apps/web/src/app/(landlord-setup)/landlord/approval-pending/review-stamp.tsx`
- Create: `apps/web/src/app/(landlord-setup)/landlord/approval-pending/approval-review.tsx`
- Modify: `apps/web/src/app/(landlord-setup)/landlord/approval-pending/page.tsx`
- Test: `apps/web/src/app/(landlord-setup)/landlord/approval-pending/approval-review.test.tsx`

**Interfaces:**
- Consumes: `useApprovalStatus`, `ApprovalStatus` (Task 4); `ONBOARDING_PATH` (Task 3).
- Produces: `export function ApprovalReview({ initialStatus }: { initialStatus: ApprovalStatus })`, `export function ReviewStamp({ status }: { status: ApprovalStatus })`.

- [ ] **Step 1: Write the failing tests**

```tsx
// approval-review.test.tsx
import { renderToStaticMarkup } from "react-dom/server";

import { ApprovalReview } from "./approval-review";

jest.mock("next/navigation", () => ({ useRouter: () => ({ replace: jest.fn() }) }));
jest.mock("@/lib/api", () => ({ api: jest.fn(), ApiError: class ApiError extends Error {} }));

const render = (status: "pending" | "verified" | "rejected") =>
  renderToStaticMarkup(<ApprovalReview initialStatus={status} />);

describe("ApprovalReview", () => {
  it("tells a pending landlord their application is being reviewed", () => {
    expect(render("pending")).toContain("reviewing your application");
  });

  it("promises to open the dashboard automatically", () => {
    expect(render("pending")).toContain("open your dashboard automatically");
  });

  it("animates the stamp only for motion-safe users", () => {
    expect(render("pending")).toContain("motion-safe:animate-stamp-press");
  });

  it("tells an approved landlord the dashboard is opening", () => {
    expect(render("verified")).toContain("Opening your dashboard");
  });

  it("gives a rejected landlord the support email as a link", () => {
    expect(render("rejected")).toContain('href="mailto:support@campushomes.co.ug"');
  });

  it("stops the stamp animation when rejected", () => {
    expect(render("rejected")).not.toContain("animate-stamp-press");
  });

  it("announces status changes politely", () => {
    expect(render("pending")).toContain('aria-live="polite"');
  });
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `cd apps/web && pnpm jest "src/app/(landlord-setup)/landlord/approval-pending/approval-review.test.tsx"`
Expected: FAIL — module `./approval-review` not found.

- [ ] **Step 3: Add the two animations to the theme**

Append to `apps/web/src/app/globals.css` (a plain `@theme` block, separate from the existing `@theme inline`):

```css
@theme {
  --animate-stamp-press: stamp-press 2.4s cubic-bezier(0.65, 0, 0.35, 1) infinite;
  --animate-ink-ring: ink-ring 2.4s ease-out infinite;

  @keyframes stamp-press {
    0%, 100% { transform: translateY(-18px) rotate(-4deg); }
    40% { transform: translateY(-26px) rotate(-6deg); }
    55% { transform: translateY(2px) rotate(0deg); }
    62% { transform: translateY(0) rotate(0deg); }
    80% { transform: translateY(-14px) rotate(-3deg); }
  }

  @keyframes ink-ring {
    0%, 54% { opacity: 0; transform: scale(0.6); }
    60% { opacity: 0.9; transform: scale(1); }
    100% { opacity: 0; transform: scale(1.5); }
  }
}
```

- [ ] **Step 4: Create the stamp**

```tsx
// review-stamp.tsx
import { cn } from "@/lib/utils";
import type { ApprovalStatus } from "./approval-status";

// Decorative: the heading next to it carries the meaning. Motion only runs
// under motion-safe, so reduced-motion users see a still stamp.
export function ReviewStamp({ status }: { status: ApprovalStatus }) {
  const pressing = status === "pending";
  const approved = status === "verified";
  return (
    <svg viewBox="0 0 160 170" aria-hidden className="h-40 w-40">
      <ellipse cx="80" cy="150" rx="58" ry="10" className="fill-teal-900/10" />
      <rect x="28" y="122" width="104" height="30" rx="6" className={approved ? "fill-coral-100" : "fill-muted"} />
      <text
        x="80"
        y="143"
        textAnchor="middle"
        className={cn("font-display text-[15px] font-bold tracking-[0.2em]", approved ? "fill-coral-600" : "fill-muted-foreground/40")}
      >
        APPROVED
      </text>
      <ellipse
        cx="80"
        cy="122"
        rx="44"
        ry="7"
        className={cn("fill-none stroke-coral-500 stroke-2 [transform-box:fill-box] origin-center opacity-0", pressing && "motion-safe:animate-ink-ring")}
      />
      <g className={cn("[transform-box:fill-box] origin-bottom", pressing && "motion-safe:animate-stamp-press")}>
        <circle cx="80" cy="30" r="18" className="fill-teal-600" />
        <rect x="72" y="44" width="16" height="40" rx="4" className="fill-teal-700" />
        <rect x="40" y="84" width="80" height="16" rx="4" className="fill-teal-800" />
        <rect x="44" y="100" width="72" height="18" rx="3" className="fill-coral-500" />
      </g>
    </svg>
  );
}
```

If `coral-100`/`coral-500`/`coral-600` or `cn` from `@/lib/utils` don't exist under those names, use the colour tokens defined in `globals.css`'s `@theme inline` and the `cn` helper the other components import; never introduce a raw hex.

- [ ] **Step 5: Create the review component**

```tsx
// approval-review.tsx
"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

import { Card, CardContent } from "@/components/ui/card";
import type { ApprovalStatus } from "./approval-status";
import { ReviewStamp } from "./review-stamp";
import { useApprovalStatus } from "./use-approval-status";

const OPEN_DASHBOARD_DELAY_MS = 1_200;

const COPY: Record<ApprovalStatus, { title: string; body: string }> = {
  pending: {
    title: "We're reviewing your application",
    body: "Our team is checking your details and documents. This page will open your dashboard automatically as soon as you're approved.",
  },
  verified: {
    title: "You're approved!",
    body: "Opening your dashboard…",
  },
  rejected: {
    title: "We couldn't verify your application",
    body: "The documents or information provided weren't clear enough. Please email our team at",
  },
};

export function ApprovalReview({ initialStatus }: { initialStatus: ApprovalStatus }) {
  const router = useRouter();
  const { status, hasTrouble } = useApprovalStatus(initialStatus);

  // Let the stamp land before leaving; entering /landlord mounts the
  // dashboard layout, whose KYC gate re-checks on the server.
  useEffect(() => {
    if (status !== "verified") return;
    const timer = setTimeout(() => router.replace("/landlord"), OPEN_DASHBOARD_DELAY_MS);
    return () => clearTimeout(timer);
  }, [status, router]);

  const copy = COPY[status];
  return (
    <div className="flex flex-1 items-center justify-center bg-gradient-to-br from-teal-700 via-teal-800 to-teal-950 p-4 sm:p-8">
      <Card className="w-full max-w-md shadow-xl">
        <CardContent className="flex flex-col items-center gap-5 p-7 text-center sm:p-10">
          <ReviewStamp status={status} />
          <div aria-live="polite">
            <h1 className="font-display text-xl font-bold text-foreground">{copy.title}</h1>
            <p className="mt-3 text-sm leading-6 text-muted-foreground">
              {copy.body}
              {status === "rejected" && (
                <>
                  {" "}
                  <a href="mailto:support@campushomes.co.ug" className="font-semibold text-primary underline underline-offset-2">
                    support@campushomes.co.ug
                  </a>{" "}
                  so we can help you complete your registration.
                </>
              )}
            </p>
          </div>
          {status === "pending" && (
            <p className="text-xs text-muted-foreground">
              {hasTrouble ? "Having trouble checking — we'll keep trying." : "Checking for updates…"}
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
```

- [ ] **Step 6: Make the page render it**

Replace `apps/web/src/app/(landlord-setup)/landlord/approval-pending/page.tsx` with:

```tsx
import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { getLandlordProfile } from "@/lib/landlord";
import { ONBOARDING_PATH } from "@/lib/landlord-gate";
import { ApprovalReview } from "./approval-review";

export const metadata: Metadata = { title: "Landlord application review" };

// The (landlord-setup) layout already redirects verified landlords and
// landlords without a submitted property; this only seeds the first render.
export default async function LandlordApprovalPendingPage() {
  const profile = await getLandlordProfile();
  if (!profile) redirect(ONBOARDING_PATH);
  return <ApprovalReview initialStatus={profile.kycStatus} />;
}
```

- [ ] **Step 7: Run the tests to verify they pass**

Run: `cd apps/web && pnpm jest "src/app/(landlord-setup)/landlord/approval-pending/" && pnpm typecheck && pnpm lint`
Expected: PASS (13 tests across Tasks 4–5), no type or lint errors.

- [ ] **Step 8: Commit**

```bash
git add apps/web/src/app/globals.css "apps/web/src/app/(landlord-setup)/landlord/approval-pending/"
git commit -m "feat(web): landlord review page with stamp animation and auto-open on approval"
```

---

### Task 6: API — `hasLiveListing` on the landlord's property list

**Files:**
- Modify: `apps/api/src/modules/listings/listings.service.ts:207-212` (`myProperties`)
- Modify: `packages/shared/src/property.ts` (`propertySchema`)
- Test: `apps/api/test/services/listings-my-properties.spec.ts` (create)

**Interfaces:**
- Produces: each item of `GET /api/v1/listings/properties/mine` gains `hasLiveListing: boolean`; shared `Property` type gains `hasLiveListing?: boolean`.

- [ ] **Step 1: Bring the test DB up to the current migrations**

```bash
docker compose -f apps/api/docker-compose.test.yml up -d --wait
DATABASE_URL=postgresql://campushomes:campushomes_test@127.0.0.1:54329/campushomes_test pnpm --filter @campushomes/api db:migrate
```

Expected: migrations applied through `0058`.

- [ ] **Step 2: Write the failing test**

```ts
// apps/api/test/services/listings-my-properties.spec.ts
/**
 * The landlord dashboard banner tells "verified, awaiting inspection" apart
 * from "listings live" using hasLiveListing on GET /listings/properties/mine.
 */
import { Pool } from 'pg';

import { RlsDb } from '../../src/db/db.module';
import { ListingsService } from '../../src/modules/listings/listings.service';
import type { RlsContext } from '../../src/db/rls-context';
import { testDatabaseUrl } from '../test-database-url';

const pool = new Pool({ connectionString: testDatabaseUrl(), max: 5 });
const listings = new ListingsService(new RlsDb(pool));

let landlordA: string;
let liveProperty: string;
let draftProperty: string;
let otherLandlordProperty: string;

const ctxA = (): RlsContext => ({ userId: landlordA, role: 'landlord' });

async function seed(sql: string, params: unknown[] = []): Promise<string> {
  const res = await pool.query(sql, params);
  return res.rows[0]?.id as string;
}

async function verifiedListing(propertyId: string, semesterId: string, key: string, inspector: string, lead: string) {
  const checklist = JSON.stringify(
    Object.fromEntries(
      ['location_gps', 'rooms_capacity', 'amenities', 'photos', 'landlord_identity', 'safety'].map((c) => [c, { passed: true }]),
    ),
  );
  // The verified-listing trigger requires a lead-approved, fully-passed visit.
  await pool.query(
    `INSERT INTO verification_visits
       (property_id, inspector_id, checklist, client_idempotency_key, result, approved_by, approved_at)
     VALUES ($1, $2, $3, $4, 'passed', $5, now())`,
    [propertyId, inspector, checklist, key, lead],
  );
  await pool.query(`INSERT INTO listings (property_id, semester_id, status) VALUES ($1, $2, 'verified')`, [propertyId, semesterId]);
}

beforeAll(async () => {
  await pool.query(
    `TRUNCATE users, landlords, ops_staff, semesters, properties, verification_visits, listings, listing_versions, units CASCADE`,
  );
  landlordA = await seed(`INSERT INTO users (phone, role, status) VALUES ('+256710000040', 'landlord', 'active') RETURNING id`);
  const landlordB = await seed(`INSERT INTO users (phone, role, status) VALUES ('+256710000041', 'landlord', 'active') RETURNING id`);
  await pool.query(`INSERT INTO landlords (user_id, legal_name) VALUES ($1, 'LL Mine A'), ($2, 'LL Mine B')`, [landlordA, landlordB]);
  const lead = await seed(`INSERT INTO users (phone, role, status) VALUES ('+256710000042', 'ops_lead', 'active') RETURNING id`);
  const inspector = await seed(`INSERT INTO users (phone, role, status) VALUES ('+256710000043', 'ops_inspector', 'active') RETURNING id`);
  await pool.query(`INSERT INTO ops_staff (user_id, team, active) VALUES ($1, 'lead', true), ($2, 'inspector', true)`, [lead, inspector]);
  const semester = await seed(
    `INSERT INTO semesters (name, starts_on, ends_on, re_verification_window_starts_on)
     VALUES ('Sem Mine Test', '2026-08-01', '2026-12-15', '2026-11-15') RETURNING id`,
  );
  const property = (landlord: string, name: string) =>
    seed(
      `INSERT INTO properties (landlord_id, name, street_address, status, catchment)
       VALUES ($1, $2, 'Kikoni', 'active', 'MUK') RETURNING id`,
      [landlord, name],
    );
  liveProperty = await property(landlordA, 'Mine Live');
  draftProperty = await property(landlordA, 'Mine Draft');
  otherLandlordProperty = await property(landlordB, 'Other Live');
  await verifiedListing(liveProperty, semester, 'mine-live-visit', inspector, lead);
  await pool.query(`INSERT INTO listings (property_id, semester_id, status) VALUES ($1, $2, 'draft')`, [draftProperty, semester]);
  await verifiedListing(otherLandlordProperty, semester, 'mine-other-visit', inspector, lead);
});

afterAll(() => pool.end());

describe('ListingsService.myProperties hasLiveListing', () => {
  it('marks a property with a verified listing as live', async () => {
    const rows = await listings.myProperties(ctxA());
    expect(rows.find((p) => p.id === liveProperty)?.hasLiveListing).toBe(true);
  });

  it('marks a property with only a draft listing as not live', async () => {
    const rows = await listings.myProperties(ctxA());
    expect(rows.find((p) => p.id === draftProperty)?.hasLiveListing).toBe(false);
  });

  it("never returns another landlord's property", async () => {
    const rows = await listings.myProperties(ctxA());
    expect(rows.map((p) => p.id)).not.toContain(otherLandlordProperty);
  });
});
```

- [ ] **Step 3: Run it to verify it fails**

Run: `cd apps/api && TEST_DATABASE_URL=postgresql://campushomes:campushomes_test@127.0.0.1:54329/campushomes_test pnpm jest test/services/listings-my-properties.spec.ts --runInBand`
Expected: FAIL — `hasLiveListing` is `undefined` (first two tests); the third passes.

- [ ] **Step 4: Implement**

Replace `myProperties` in `listings.service.ts`:

```ts
  myProperties(ctx: RlsContext) {
    // RLS filters both statements to the landlord's own rows. Two statements,
    // one policied table each: never join/correlate RLS-heavy tables in one
    // statement (2026-09-23 incident).
    return this.rlsDb.run(ctx, async (db) => {
      const rows = await db.select().from(properties).orderBy(desc(properties.createdAt));
      if (rows.length === 0) return [];
      const live = await db
        .selectDistinct({ propertyId: listings.propertyId })
        .from(listings)
        .where(and(eq(listings.status, 'verified'), inArray(listings.propertyId, rows.map((p) => p.id))));
      const liveIds = new Set(live.map((l) => l.propertyId));
      return rows.map((p) => ({ ...p, hasLiveListing: liveIds.has(p.id) }));
    });
  }
```

Add `and` and `inArray` to the file's existing `drizzle-orm` import if they are missing, and `listings` to the schema import if missing.

In `packages/shared/src/property.ts`, add to `propertySchema`'s object:

```ts
  // From GET /listings/properties/mine: true once a listing for this property
  // passed inspection and was published (status 'verified').
  hasLiveListing: z.boolean().optional(),
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `pnpm --filter @campushomes/shared build && cd apps/api && TEST_DATABASE_URL=postgresql://campushomes:campushomes_test@127.0.0.1:54329/campushomes_test pnpm jest test/services/listings-my-properties.spec.ts --runInBand`
Expected: PASS (3 tests)

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/modules/listings/listings.service.ts apps/api/test/services/listings-my-properties.spec.ts packages/shared/src/property.ts
git commit -m "feat(api): flag landlord properties that have a live listing"
```

---

### Task 7: Dashboard banner wording based on real state

**Files:**
- Modify: `apps/web/src/components/kyc-banner.tsx`
- Test: `apps/web/src/components/kyc-banner.test.tsx` (create)
- Modify: `apps/web/src/app/(landlord)/landlord/page.tsx`, `apps/web/src/app/(landlord)/landlord/properties/page.tsx`, `apps/web/src/app/(landlord)/landlord/rooms/page.tsx` (pass the new prop)

**Interfaces:**
- Consumes: `Property.hasLiveListing?: boolean` (Task 6).
- Produces: `KycBanner({ status, hasLiveListing = false }: { status: "pending" | "verified" | "rejected"; hasLiveListing?: boolean })`.

- [ ] **Step 1: Write the failing tests**

```tsx
// apps/web/src/components/kyc-banner.test.tsx
import { renderToStaticMarkup } from "react-dom/server";

import { KycBanner } from "./kyc-banner";

describe("KycBanner", () => {
  it("tells a verified landlord without a live listing that inspection comes next", () => {
    expect(renderToStaticMarkup(<KycBanner status="verified" />)).toContain("schedule an inspection of your property");
  });

  it("does not promise reservations before a listing is live", () => {
    expect(renderToStaticMarkup(<KycBanner status="verified" />)).not.toContain("Students can now reserve");
  });

  it("tells a verified landlord with a live listing that students can reserve", () => {
    expect(renderToStaticMarkup(<KycBanner status="verified" hasLiveListing />)).toContain(
      "Students can now reserve your rooms",
    );
  });
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `cd apps/web && pnpm jest src/components/kyc-banner.test.tsx`
Expected: FAIL on tests 1 and 3.

- [ ] **Step 3: Implement**

In `kyc-banner.tsx` change the signature and the verified branch:

```tsx
export function KycBanner({
  status,
  hasLiveListing = false,
}: {
  status: "pending" | "verified" | "rejected";
  hasLiveListing?: boolean;
}) {
  if (status === "verified") {
    return (
      <div className="flex items-center gap-3 rounded-lg border border-primary/30 bg-accent px-4 py-3 text-sm font-semibold text-teal-700">
        <ShieldCheck aria-hidden className="size-5 shrink-0" />
        {hasLiveListing
          ? "Your account is verified and your listings are live. Students can now reserve your rooms."
          : "Your account is verified. Our Ops team will contact you to schedule an inspection of your property — your listings go live once it passes."}
      </div>
    );
  }
```

Leave the `rejected` and `pending` branches unchanged.

In each of the three pages, pass the flag where the banner renders (each already loads `properties` via `getMyProperties()`):

```tsx
<KycBanner status={profile.kycStatus} hasLiveListing={properties.some((p) => p.hasLiveListing)} />
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd apps/web && pnpm jest src/components/kyc-banner.test.tsx && pnpm typecheck`
Expected: PASS, no type errors.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/components/kyc-banner.tsx apps/web/src/components/kyc-banner.test.tsx "apps/web/src/app/(landlord)/landlord/page.tsx" "apps/web/src/app/(landlord)/landlord/properties/page.tsx" "apps/web/src/app/(landlord)/landlord/rooms/page.tsx"
git commit -m "feat(web): verified banner says inspection comes next until a listing is live"
```

(The profile page's banner is handled in Task 10.)

---

### Task 8: Roomier, resizable onboarding form

**Files:**
- Modify: `apps/web/src/app/(landlord-setup)/landlord/onboarding/onboarding-wizard.tsx` (card, spacing)
- Modify: `apps/web/src/components/property-extended-fields.tsx:173-180` (location field → textarea)
- Test: `apps/web/src/components/property-extended-fields.test.tsx` (create)

**Interfaces:** none new. `PropertyExtendedFields` keeps its props (`value`, `onChange`, `idPrefix`) and is shared with the edit dialog.

- [ ] **Step 1: Write the failing test**

Before writing: open `property-extended-fields.tsx` around line 69 and find the exported empty/default value object for the fields. If it isn't exported, export it as `EMPTY_EXTENDED_FIELDS`; otherwise import it by its existing name below.

```tsx
// apps/web/src/components/property-extended-fields.test.tsx
import { renderToStaticMarkup } from "react-dom/server";

import { EMPTY_EXTENDED_FIELDS, PropertyExtendedFields } from "./property-extended-fields";

describe("PropertyExtendedFields", () => {
  it("lets the landmark description grow as a resizable text area", () => {
    const html = renderToStaticMarkup(
      <PropertyExtendedFields value={EMPTY_EXTENDED_FIELDS} onChange={() => {}} idPrefix="t" />,
    );

    expect(html).toMatch(/<textarea[^>]*id="t-locationDetails"[^>]*resize-y/);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `cd apps/web && pnpm jest src/components/property-extended-fields.test.tsx`
Expected: FAIL — no `<textarea` with that id.

- [ ] **Step 3: Implement the textarea**

Replace the `locationDetails` `<Input ... />` with (import `Textarea` from `@/components/ui/textarea`):

```tsx
        <Textarea
          id={`${idPrefix}-locationDetails`}
          value={value.locationDetails}
          onChange={(e) => onChange({ locationDetails: e.target.value })}
          placeholder="e.g. Uganda, Kampala, Wandegeya, opposite Total fuel station"
          rows={2}
          className="min-h-16 max-h-60 resize-y"
        />
```

If the attribute order puts `class` before `id` in the rendered markup, change the test regex to `/<textarea(?=[^>]*id="t-locationDetails")(?=[^>]*resize-y)/` (order-independent).

- [ ] **Step 4: Run the test to verify it passes**

Run: same as Step 2. Expected: PASS.

- [ ] **Step 5: Give the wizard room and a resize corner**

In `onboarding-wizard.tsx`, change the main card and content:

```tsx
    <Card
      className={cn(
        "w-full shadow-md",
        step === "property"
          ? "max-w-5xl sm:min-w-[36rem] sm:min-h-[32rem] sm:resize sm:overflow-auto sm:max-w-[min(100%,72rem)]"
          : "max-w-md",
      )}
    >
      <CardContent className="p-6 sm:p-10">
```

In the property form, change `className="space-y-4"` on `<form onSubmit={submitProperty} ...>` to `className="space-y-7"`, and each `grid gap-4 sm:grid-cols-2` inside it to `grid gap-5 md:grid-cols-2`.

- [ ] **Step 6: Verify**

Run: `cd apps/web && pnpm typecheck && pnpm lint`
Expected: no errors. (Visual check happens in Task 11.)

- [ ] **Step 7: Commit**

```bash
git add apps/web/src/components/property-extended-fields.tsx apps/web/src/components/property-extended-fields.test.tsx "apps/web/src/app/(landlord-setup)/landlord/onboarding/onboarding-wizard.tsx"
git commit -m "feat(web): roomier, corner-resizable landlord onboarding form"
```

---

### Task 9: Resizable edit-property dialog

**Files:**
- Modify: `apps/web/src/components/ui/dialog.tsx` (new `xl` size, `resizable` prop)
- Modify: `apps/web/src/app/(landlord)/landlord/properties/property-form-dialog.tsx:420`
- Test: `apps/web/src/components/ui/dialog.test.tsx` (create)

**Interfaces:**
- Produces: `Dialog` accepts `size: "sm" | "md" | "lg" | "xl"` (existing sizes unchanged) and `resizable?: boolean` (default `false`).

- [ ] **Step 1: Write the failing tests**

```tsx
// apps/web/src/components/ui/dialog.test.tsx
import { renderToStaticMarkup } from "react-dom/server";

import { Dialog } from "./dialog";

const render = (resizable: boolean) =>
  renderToStaticMarkup(
    <Dialog open onOpenChange={() => {}} size="xl" resizable={resizable}>
      <p>body</p>
    </Dialog>,
  );

describe("Dialog", () => {
  it("offers a corner resize handle on larger screens when resizable", () => {
    expect(render(true)).toContain("sm:resize");
  });

  it("stays fixed-size by default", () => {
    expect(render(false)).not.toContain("sm:resize");
  });
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `cd apps/web && pnpm jest src/components/ui/dialog.test.tsx`
Expected: FAIL — type error on `size="xl"`/`resizable`, or missing class.

- [ ] **Step 3: Implement**

In `dialog.tsx`:
- Add to `DIALOG_WIDTH`: `xl: "w-[min(60rem,calc(100vw-2rem))]",`
- Add `resizable = false` to the destructured props and `resizable?: boolean` to the props type.
- In the `<dialog>` `className={cn(...)}` add, after `DIALOG_WIDTH[size],`:

```tsx
        // Native corner resize (CSS `resize` works with overflow-hidden),
        // bounded so the dialog never outgrows the viewport. Phones keep the
        // fixed full-width layout.
        resizable && "sm:resize sm:min-w-[36rem] sm:min-h-[24rem] max-w-[95vw] sm:max-h-[90vh]",
```

In `property-form-dialog.tsx` line 420 change `size="lg"` to `size="xl" resizable`.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd apps/web && pnpm jest src/components/ui/dialog.test.tsx && pnpm typecheck`
Expected: PASS, no type errors.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/components/ui/dialog.tsx apps/web/src/components/ui/dialog.test.tsx "apps/web/src/app/(landlord)/landlord/properties/property-form-dialog.tsx"
git commit -m "feat(web): wider, corner-resizable edit property dialog"
```

---

### Task 10: Account Settings in four sections

**Files:**
- Move: `apps/web/src/app/(admin)/admin/profile/security-settings.tsx` → `apps/web/src/components/account/security-settings.tsx`
- Modify: `apps/web/src/app/(admin)/admin/profile/page.tsx:6`, `apps/web/src/app/(ops)/ops/profile/page.tsx:5` (import path)
- Create: `apps/web/src/app/(landlord)/landlord/profile/account-sections.ts`
- Create: `apps/web/src/app/(landlord)/landlord/profile/account-settings-nav.tsx`
- Create: `apps/web/src/app/(landlord)/landlord/profile/use-particulars.ts`
- Modify: `apps/web/src/app/(landlord)/landlord/profile/landlord-profile-form.tsx` (split into section forms)
- Modify: `apps/web/src/app/(landlord)/landlord/profile/page.tsx`
- Test: `apps/web/src/app/(landlord)/landlord/profile/account-settings-nav.test.tsx` (create)

**Interfaces:**
- Produces:
  - `export const ACCOUNT_SECTIONS` (ids `personal`, `identity`, `contact`, `security`; labels "Personal details", "Identity & verification", "Contact & emergency", "Sign-in & security").
  - `export function AccountSettingsNav()` — anchor links `#personal`, `#identity`, `#contact`, `#security`.
  - `export function useParticulars(profile: LandlordProfileWithParticulars)` returning `{ fields, setField, save, pending, saved, error }` where `fields` has `dateOfBirth, gender, nationality, address, emergencyContactName, emergencyContactPhone` (strings) and `save(e: React.FormEvent): Promise<void>` PATCHes `/landlords/particulars` with all six fields (same payload as today).
  - `export function LandlordAccountSettings({ profile, hasLiveListing, email })`.
  - `ChangeEmailForm`, `ChangePasswordForm` from `@/components/account/security-settings` (unchanged API).

- [ ] **Step 1: Write the failing tests**

```tsx
// account-settings-nav.test.tsx
import { renderToStaticMarkup } from "react-dom/server";

import { AccountSettingsNav } from "./account-settings-nav";

describe("AccountSettingsNav", () => {
  it.each([
    ["#personal", "Personal details"],
    ["#identity", "Identity &amp; verification"],
    ["#contact", "Contact &amp; emergency"],
    ["#security", "Sign-in &amp; security"],
  ])("links %s to the %s section", (href, label) => {
    expect(renderToStaticMarkup(<AccountSettingsNav />)).toContain(`href="${href}">${label}</a>`);
  });
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `cd apps/web && pnpm jest "src/app/(landlord)/landlord/profile/account-settings-nav.test.tsx"`
Expected: FAIL — module not found.

- [ ] **Step 3: Create sections and nav**

```ts
// account-sections.ts
export const ACCOUNT_SECTIONS = [
  { id: "personal", label: "Personal details" },
  { id: "identity", label: "Identity & verification" },
  { id: "contact", label: "Contact & emergency" },
  { id: "security", label: "Sign-in & security" },
] as const;
```

```tsx
// account-settings-nav.tsx
import { ACCOUNT_SECTIONS } from "./account-sections";

export function AccountSettingsNav() {
  return (
    <nav aria-label="Account settings sections" className="hidden lg:block">
      <ul className="sticky top-6 space-y-1 text-sm">
        {ACCOUNT_SECTIONS.map((s) => (
          <li key={s.id}>
            <a
              href={`#${s.id}`}
              className="block rounded-md px-3 py-2 font-semibold text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            >{s.label}</a>
          </li>
        ))}
      </ul>
    </nav>
  );
}
```

(Keep `>{s.label}</a>` with no whitespace so the markup is `href="#x">Label</a>` as the test expects.)

- [ ] **Step 4: Run the tests to verify they pass**

Run: same as Step 2. Expected: PASS (4 tests).

- [ ] **Step 5: Move the shared security forms**

```bash
mkdir -p apps/web/src/components/account
git mv "apps/web/src/app/(admin)/admin/profile/security-settings.tsx" apps/web/src/components/account/security-settings.tsx
```

Update both imports to `import { ChangeEmailForm, ChangePasswordForm } from "@/components/account/security-settings";` in `(admin)/admin/profile/page.tsx` and `(ops)/ops/profile/page.tsx`. Fix any relative imports inside the moved file to `@/` aliases.

- [ ] **Step 6: Extract the particulars state into a hook**

Create `use-particulars.ts` (`"use client"`) by moving, unchanged, the six particulars `useState`s, the `particularsPending/particularsSaved/particularsError` state and `submitParticulars` out of `landlord-profile-form.tsx` (keep its `router.refresh()` and `api("/landlords/particulars", ...)` call exactly), exposed as:

```ts
export function useParticulars(profile: LandlordProfileWithParticulars) {
  // ...the moved useState calls and submitParticulars...
  const fields = { dateOfBirth, gender, nationality, address, emergencyContactName, emergencyContactPhone };
  const setters = {
    dateOfBirth: setDateOfBirth,
    gender: setGender,
    nationality: setNationality,
    address: setAddress,
    emergencyContactName: setEmergencyContactName,
    emergencyContactPhone: setEmergencyContactPhone,
  };
  function setField(name: keyof typeof fields, value: string) {
    setters[name](value);
  }
  return { fields, setField, save: submitParticulars, pending: particularsPending, saved: particularsSaved, error: particularsError };
}
```

`save` keeps sending all six fields, so saving from either section never blanks the other section's values.

- [ ] **Step 7: Split the form into section components**

In `landlord-profile-form.tsx` replace the single exported component with these exports, reusing the existing JSX verbatim (same ids, classes, labels, save/status lines):

- `IdentityForm({ profile }: { profile: LandlordProfileWithParticulars })` — the existing legal-name form / read-only legal-name block (keep its own `legalName` state, `submit`, `editable` logic), followed by, when `profile.idDocStorageKey` is set, `<ViewDocumentButton storageKey={profile.idDocStorageKey} label="View ID document" />` (from `@/components/view-document-button`).
- `PersonalDetailsForm({ particulars }: { particulars: ReturnType<typeof useParticulars> })` — date of birth, gender, nationality, address bound to `particulars.fields` / `particulars.setField`, `onSubmit={particulars.save}`, its own "Save details" button and saved/error lines.
- `ContactDetailsForm({ particulars }: same)` — emergency contact name input and the `PhoneField` for the emergency phone, same save button and status lines.

Add the client wrapper in the same file (import `AccountSettingsNav`, `KycBanner`, `ChangeEmailForm`, `ChangePasswordForm`, `useParticulars`):

```tsx
export function LandlordAccountSettings({
  profile,
  hasLiveListing,
  email,
}: {
  profile: LandlordProfileWithParticulars;
  hasLiveListing: boolean;
  email: string | null;
}) {
  const particulars = useParticulars(profile);
  return (
    <div className="grid gap-10 lg:grid-cols-[12rem_minmax(0,1fr)]">
      <AccountSettingsNav />
      <div className="max-w-2xl space-y-12">
        <section id="personal" aria-labelledby="personal-h" className="scroll-mt-6 space-y-4">
          <h2 id="personal-h" className="font-display text-lg font-bold">Personal details</h2>
          <PersonalDetailsForm particulars={particulars} />
        </section>
        <section id="identity" aria-labelledby="identity-h" className="scroll-mt-6 space-y-4">
          <h2 id="identity-h" className="font-display text-lg font-bold">Identity &amp; verification</h2>
          <KycBanner status={profile.kycStatus} hasLiveListing={hasLiveListing} />
          <IdentityForm profile={profile} />
        </section>
        <section id="contact" aria-labelledby="contact-h" className="scroll-mt-6 space-y-4">
          <h2 id="contact-h" className="font-display text-lg font-bold">Contact &amp; emergency</h2>
          <ContactDetailsForm particulars={particulars} />
        </section>
        <section id="security" aria-labelledby="security-h" className="scroll-mt-6 space-y-6">
          <h2 id="security-h" className="font-display text-lg font-bold">Sign-in &amp; security</h2>
          <ChangeEmailForm currentEmail={email} />
          <ChangePasswordForm />
        </section>
      </div>
    </div>
  );
}
```

- [ ] **Step 8: Update the page**

```tsx
// apps/web/src/app/(landlord)/landlord/profile/page.tsx
import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { getLandlordProfile, getMyProperties } from "@/lib/landlord";
import { ONBOARDING_PATH } from "@/lib/landlord-gate";
import { apiServer } from "@/lib/server-api";
import { LandlordAccountSettings } from "./landlord-profile-form";

export const metadata: Metadata = { title: "Account settings" };

export default async function LandlordProfilePage() {
  const [profile, properties, particulars] = await Promise.all([
    getLandlordProfile(),
    getMyProperties(),
    apiServer<{ email: string | null }>("/me/particulars"),
  ]);
  if (!profile) redirect(ONBOARDING_PATH);

  return (
    <>
      <h1 className="text-2xl">Account settings</h1>
      <div className="mt-6">
        <LandlordAccountSettings
          profile={profile}
          hasLiveListing={properties.some((p) => p.hasLiveListing)}
          email={particulars?.email ?? null}
        />
      </div>
    </>
  );
}
```

- [ ] **Step 9: Verify**

Run: `cd apps/web && pnpm jest "src/app/(landlord)/landlord/profile/" && pnpm typecheck && pnpm lint`
Expected: PASS, no type or lint errors. `grep -rn "admin/profile/security-settings" src` returns nothing.

- [ ] **Step 10: Commit**

```bash
git add -A apps/web/src/components/account "apps/web/src/app/(admin)/admin/profile" "apps/web/src/app/(ops)/ops/profile/page.tsx" "apps/web/src/app/(landlord)/landlord/profile"
git commit -m "feat(web): landlord account settings in four sections with sign-in and security"
```

---

### Task 11: Full gate, browser verification, PR

**Files:** none new (fixes only, if verification finds issues; each fix gets its own commit).

- [ ] **Step 1: Full gate**

```bash
pnpm --filter @campushomes/shared build
pnpm lint && pnpm typecheck
TEST_DATABASE_URL=postgresql://campushomes:campushomes_test@127.0.0.1:54329/campushomes_test pnpm test
cd apps/api && pnpm drizzle-kit check
```

Expected: all green; `drizzle-kit check` reports "Everything's fine".

- [ ] **Step 2: Browser verification on the local stack** (`pnpm local:up` from this worktree, then the `api` and `web` previews; sign-in via local Logto, codes print to the API console)

Check each, with a screenshot of the key states:
1. `/landlords` → "Create or use one account" → sign-in shows only "Create landlord account" (no student, Administration or Operations).
2. `/landlords` → "Sign in to your dashboard" → only "Sign in to manage my properties".
3. New landlord: onboarding shows no dashboard sidebar; the property card resizes from its corner within bounds; the landmark field resizes vertically.
4. Submit → lands on the review page (stamp animating), not the dashboard. Typing `/landlord/bookings` in the address bar also lands on the review page.
5. Approve as admin in a second window → within ~5 s the review page shows "You're approved!" and opens the dashboard with no reload.
6. Reject a second test landlord → the review page shows the rejection copy and the `support@campushomes.co.ug` link.
7. Dashboard banner says inspection comes next. The edit property dialog opens wider, resizes from its corner, and stays inside the viewport.
8. Account Settings: four sections, side menu jumps to each, saving Personal details keeps Contact & emergency values, change-email and change-password forms render.
9. With reduced motion emulated, the stamp is still. The account menu shows the username without "@".
10. At 375 px width: no horizontal scroll on the sign-in, onboarding, review and settings pages; no resize handles.

- [ ] **Step 3: Push and open the PR to `development`**

```bash
git push -u origin feat/landlord-onboarding-ux
gh pr create --base development --title "feat: landlord onboarding UX and approval gate" --body "$(cat <<'EOF'
Implements docs/superpowers/specs/2026-10-05-landlord-onboarding-ux-design.md.

Fixes a real bug: pending landlords reached the dashboard because the KYC gate
lived in a layout that client navigation skipped. Onboarding and the approval
wait now live in a bare (landlord-setup) route group.

- Landlord-only sign-in options from the landlords page
- Review page with stamp animation; auto-opens the dashboard on approval (5 s poll); rejection points to support@campushomes.co.ug
- Banner says inspection comes next until a listing is live (new hasLiveListing on GET /listings/properties/mine)
- Roomier, corner-resizable onboarding form and edit-property dialog
- Account Settings in four sections; shared sign-in & security forms
- Usernames shown without "@"

Deviations from the spec: alternative name stays single-line; navigation and
reduced-motion behaviour verified by pure-function tests plus the browser check.
EOF
)"
```

Expected: PR open against `development`, CI running.
