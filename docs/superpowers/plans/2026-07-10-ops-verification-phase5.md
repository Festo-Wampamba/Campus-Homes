# Phase 5 — Ops Verification Queue + Offline Inspection Mode Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the ops portal's lead-side verification workflow (queue,
schedule, approve, publish, strikes) and the inspector-side offline-capable
6-component Inspection Mode, per
`docs/superpowers/specs/2026-07-10-ops-verification-phase5-design.md`.

**Architecture:** Four small new ops-facing GET endpoints fill gaps the spec
found (inspector picker, an inspector's own visits, single-visit review,
property→listing lookup). The frontend follows this codebase's established
pattern exactly: server components fetch via `apiServer()`, client components
mutate via `api()` + local `useState` + `router.refresh()` — no
`react-hook-form`, no generic `Select`/dialog abstractions, plain native
`<select>`/`<input>` styled inline (that's what every existing form in this
repo already does; check `student-profile-form.tsx` before assuming
otherwise). Inspection Mode's offline queue is a hand-rolled IndexedDB
wrapper (no `idb` dependency) drained by an in-page sync manager (no Service
Worker — that's Phase 7's job).

**Tech Stack:** NestJS 11 + Drizzle + Postgres RLS (backend); Next.js 16 +
React 19 + plain fetch (frontend); Jest for both (frontend gets its first
test runner in this phase, via Next's built-in `next/jest` — no `ts-jest`,
no Babel config).

## Global Constraints

- Node 24. Always run `pnpm` under Node 24 (`nvm use 24` if needed).
- `packages/shared` is compiled to `dist/` — run `pnpm --filter
  @campushomes/shared build` after every edit there, before the API or web
  app will see the change.
- No `class-validator` DTOs — request validation is nestjs-zod against
  `packages/shared` schemas only.
- Every service query goes through `RlsDb.run(ctx, fn)` — never touch the
  pool directly.
- `no-explicit-any` is an error project-wide. Never use `any`.
- Named exports only, one component/class per file.
- Docker test DB must be running for backend tests:
  `docker compose -f apps/api/docker-compose.test.yml up -d --wait`, then
  (first time only) `DATABASE_URL=postgresql://campushomes:campushomes_test@localhost:54329/campushomes_test pnpm --filter @campushomes/api db:migrate`.
- Run only the specific test file you're working on, not the full suite,
  per task. The final task runs the full `pnpm lint && pnpm typecheck &&
  pnpm test` gate.
- One assertion per test (combine multiple checks into a single object
  literal passed to one `expect(...).toEqual(...)` — see
  `apps/api/test/services/reservations-flow.spec.ts` for the established
  style). No `if`/loops inside a test body.
- Commit after every task.

---

### Task 1: Shared schemas and enum type exports

**Files:**
- Modify: `packages/shared/src/enums.ts`
- Modify: `packages/shared/src/ops.ts`

**Interfaces:**
- Consumes: nothing new.
- Produces: types `StrikeReason`, `VisitResult` (from `enums.ts`); schemas
  and inferred types `opsInspectorSchema`/`OpsInspector`,
  `opsQueueRowSchema`/`OpsQueueRow`, `opsVisitMineSchema`/`OpsVisitMine`,
  `opsVisitDetailSchema`/`OpsVisitDetail`,
  `opsPropertyListingSchema`/`OpsPropertyListing` (from `ops.ts`) — every
  later task in this plan imports these from `@campushomes/shared`.

- [ ] **Step 1: Add the two missing enum type exports**

In `packages/shared/src/enums.ts`, find this block (near the bottom, right
after `VERIFICATION_CHECKLIST_COMPONENTS`):

```ts
export type VerificationChecklistComponent = (typeof VERIFICATION_CHECKLIST_COMPONENTS)[number];
```

Add these two lines directly after it:

```ts
export type VisitResult = (typeof VISIT_RESULTS)[number];
export type StrikeReason = (typeof STRIKE_REASONS)[number];
```

- [ ] **Step 2: Add the new response schemas to `ops.ts`**

Change the top of `packages/shared/src/ops.ts` from:

```ts
import { z } from 'zod';

import { STRIKE_REASONS, VISIT_RESULTS } from './enums.js';
import { idempotencyKey, ugxAmount, uuid } from './common.js';
import { verificationChecklistSchema } from './listing.js';
```

to:

```ts
import { z } from 'zod';

import {
  CATCHMENTS,
  LISTING_STATUSES,
  PROPERTY_STATUSES,
  STRIKE_REASONS,
  VISIT_RESULTS,
} from './enums.js';
import { idempotencyKey, ugxAmount, uuid } from './common.js';
import { verificationChecklistSchema } from './listing.js';
```

Then append this to the end of the file:

```ts
// Ops-lead inspector picker (schedule-visit form) — GET /ops/inspectors.
export const opsInspectorSchema = z.object({
  id: uuid,
  name: z.string(),
  catchment: z.enum(CATCHMENTS),
});
export type OpsInspector = z.infer<typeof opsInspectorSchema>;

// Ops-lead verification queue row — GET /ops/queue (raw SQL row, snake_case
// like listingSearchResultSchema — see listing.ts).
export const opsQueueRowSchema = z.object({
  id: uuid,
  name: z.string(),
  street_address: z.string(),
  status: z.enum(PROPERTY_STATUSES),
  created_at: z.string(),
  visit_id: uuid.nullable(),
  result: z.enum(VISIT_RESULTS).nullable(),
  scheduled_at: z.string().nullable(),
  inspector_id: uuid.nullable(),
  age_hours: z.coerce.number(),
});
export type OpsQueueRow = z.infer<typeof opsQueueRowSchema>;

// Inspector's own assigned, not-yet-approved visits — GET /ops/visits/mine
// (raw SQL row).
export const opsVisitMineSchema = z.object({
  visit_id: uuid,
  property_id: uuid,
  property_name: z.string(),
  street_address: z.string(),
  scheduled_at: z.string().nullable(),
  result: z.enum(VISIT_RESULTS),
});
export type OpsVisitMine = z.infer<typeof opsVisitMineSchema>;

// Full visit record for lead review — GET /ops/visits/:id.
export const opsVisitDetailSchema = z.object({
  id: uuid,
  propertyId: uuid,
  inspectorId: uuid,
  scheduledAt: z.string().nullable(),
  startedAt: z.string().nullable(),
  completedAt: z.string().nullable(),
  visitGpsLat: z.string().nullable(),
  visitGpsLon: z.string().nullable(),
  checklist: verificationChecklistSchema.partial(),
  result: z.enum(VISIT_RESULTS),
  failureReason: z.string().nullable(),
  approvedBy: uuid.nullable(),
  approvedAt: z.string().nullable(),
});
export type OpsVisitDetail = z.infer<typeof opsVisitDetailSchema>;

// A property's listings, for linking visit approval to the right publish
// target — GET /ops/properties/:id/listings.
export const opsPropertyListingSchema = z.object({
  id: uuid,
  status: z.enum(LISTING_STATUSES),
  semesterId: uuid,
});
export type OpsPropertyListing = z.infer<typeof opsPropertyListingSchema>;
```

- [ ] **Step 3: Build the shared package and typecheck**

Run: `pnpm --filter @campushomes/shared build && pnpm --filter @campushomes/shared typecheck`
Expected: both succeed with no output (tsc is silent on success).

- [ ] **Step 4: Commit**

```bash
git add packages/shared/src/enums.ts packages/shared/src/ops.ts
git commit -m "$(cat <<'EOF'
Add shared schemas for Phase 5 ops-facing endpoints

Response contracts for the inspector picker, verification queue row,
inspector's own visits, single-visit detail, and property-to-listing
lookup — plus the two enum type exports (StrikeReason, VisitResult)
the frontend forms need.
EOF
)"
```

---

### Task 2: Backend — ops-facing lookup endpoints

**Files:**
- Modify: `apps/api/src/modules/ops/ops.service.ts`
- Modify: `apps/api/src/modules/ops/ops.controller.ts`
- Create: `apps/api/test/services/ops-directory.spec.ts`

**Interfaces:**
- Consumes: `RlsContext`, `RlsDb.run` (`apps/api/src/db/rls-context.ts`,
  `apps/api/src/db/db.module.ts` — unchanged); schema tables `users`,
  `opsStaff`, `listings`, `verificationVisits` (`apps/api/src/db/schema`).
- Produces: `OpsService.listInspectors(ctx)`, `OpsService.myVisits(ctx)`,
  `OpsService.visitDetail(ctx, visitId)`,
  `OpsService.propertyListings(ctx, propertyId)`; routes `GET
  /ops/inspectors`, `GET /ops/visits/mine`, `GET /ops/visits/:id`, `GET
  /ops/properties/:id/listings`. Task 8 (`lib/ops.ts`) calls all four routes.

- [ ] **Step 1: Write the failing service-level test**

Create `apps/api/test/services/ops-directory.spec.ts`:

```ts
/**
 * Service-level tests for the Phase 5 ops-facing lookups (§9): inspector
 * picker, an inspector's own visit queue, single-visit review, and the
 * property→listing lookup that links visit approval to publish.
 */
import { Pool } from 'pg';

import { RlsDb } from '../../src/db/db.module';
import { AuditService } from '../../src/modules/ops/audit.service';
import { OpsService } from '../../src/modules/ops/ops.service';
import type { RlsContext } from '../../src/db/rls-context';

const TEST_DATABASE_URL =
  process.env.TEST_DATABASE_URL ??
  'postgresql://campushomes:campushomes_test@localhost:54329/campushomes_test';

const pool = new Pool({ connectionString: TEST_DATABASE_URL, max: 5 });
const rlsDb = new RlsDb(pool);
const audit = new AuditService(rlsDb);
const ops = new OpsService(rlsDb, audit);

let opsLead: string;
let inspectorActive: string;
let inspectorInactive: string;
let propertyA: string;
let propertyB: string;
let visitA: string;

const leadCtx = (): RlsContext => ({ userId: opsLead, role: 'ops_lead' });
const inspectorActiveCtx = (): RlsContext => ({
  userId: inspectorActive,
  role: 'ops_inspector',
});

async function seed(sql: string, params: unknown[] = []): Promise<string> {
  const res = await pool.query(sql, params);
  return res.rows[0]?.id as string;
}

beforeAll(async () => {
  await pool.query(
    `TRUNCATE users, students, landlords, ops_staff, semesters, properties,
     verification_visits, listings CASCADE`,
  );

  opsLead = await seed(
    `INSERT INTO users (phone, role, status) VALUES ('+256710000010', 'ops_lead', 'active') RETURNING id`,
  );
  inspectorActive = await seed(
    `INSERT INTO users (phone, role, status) VALUES ('+256710000011', 'ops_inspector', 'active') RETURNING id`,
  );
  inspectorInactive = await seed(
    `INSERT INTO users (phone, role, status) VALUES ('+256710000012', 'ops_inspector', 'active') RETURNING id`,
  );
  const landlord = await seed(
    `INSERT INTO users (phone, role, status) VALUES ('+256710000013', 'landlord', 'active') RETURNING id`,
  );
  await pool.query(
    `INSERT INTO landlords (user_id, legal_name) VALUES ($1, 'LL Directory Test')`,
    [landlord],
  );
  await pool.query(
    `INSERT INTO ops_staff (user_id, team, active) VALUES ($1, 'lead', true), ($2, 'inspector', true), ($3, 'inspector', false)`,
    [opsLead, inspectorActive, inspectorInactive],
  );

  const semester = await seed(
    `INSERT INTO semesters (name, starts_on, ends_on, re_verification_window_starts_on)
     VALUES ('Sem Directory Test', '2026-08-01', '2026-12-15', '2026-11-15') RETURNING id`,
  );
  propertyA = await seed(
    `INSERT INTO properties (landlord_id, name, street_address, status)
     VALUES ($1, 'Property A', 'Kikoni', 'active') RETURNING id`,
    [landlord],
  );
  propertyB = await seed(
    `INSERT INTO properties (landlord_id, name, street_address, status)
     VALUES ($1, 'Property B', 'Wandegeya', 'active') RETURNING id`,
    [landlord],
  );
  await seed(
    `INSERT INTO listings (property_id, semester_id, status) VALUES ($1, $2, 'pending_verification') RETURNING id`,
    [propertyA, semester],
  );
  visitA = await seed(
    `INSERT INTO verification_visits (property_id, inspector_id, checklist, client_idempotency_key, result)
     VALUES ($1, $2, $3, 'directory-test-visit-a', 'passed') RETURNING id`,
    [propertyA, inspectorActive, JSON.stringify({ location_gps: { passed: true } })],
  );
  await seed(
    `INSERT INTO verification_visits (property_id, inspector_id, client_idempotency_key)
     VALUES ($1, $2, 'directory-test-visit-b') RETURNING id`,
    [propertyB, inspectorInactive],
  );
});

afterAll(async () => {
  await pool.end();
});

describe('listInspectors', () => {
  it('returns only active inspectors, not the inactive one', async () => {
    const rows = await ops.listInspectors(leadCtx());
    expect(rows.map((r) => r.id).sort()).toEqual([inspectorActive].sort());
  });
});

describe('myVisits', () => {
  it("returns only the calling inspector's own unapproved visits", async () => {
    const rows = (await ops.myVisits(inspectorActiveCtx())) as Array<{ visit_id: string }>;
    expect(rows.map((r) => r.visit_id)).toEqual([visitA]);
  });
});

describe('visitDetail', () => {
  it('returns the full visit row including checklist', async () => {
    const visit = await ops.visitDetail(leadCtx(), visitA);
    expect({
      id: visit.id,
      result: visit.result,
      checklistPassed: visit.checklist.location_gps?.passed,
    }).toEqual({ id: visitA, result: 'passed', checklistPassed: true });
  });

  it('throws for an unknown visit id', async () => {
    await expect(
      ops.visitDetail(leadCtx(), '00000000-0000-0000-0000-000000000000'),
    ).rejects.toThrow(/not found/i);
  });
});

describe('propertyListings', () => {
  it("returns property A's listing", async () => {
    const rows = await ops.propertyListings(leadCtx(), propertyA);
    expect({ count: rows.length, status: rows[0]?.status }).toEqual({
      count: 1,
      status: 'pending_verification',
    });
  });

  it('returns empty for a property with no listing', async () => {
    const rows = await ops.propertyListings(leadCtx(), propertyB);
    expect(rows).toEqual([]);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run:
```bash
docker compose -f apps/api/docker-compose.test.yml up -d --wait
pnpm --filter @campushomes/api test -- test/services/ops-directory.spec.ts
```
Expected: FAIL — `ops.listInspectors is not a function` (the service methods don't exist yet).

- [ ] **Step 3: Implement the service methods**

In `apps/api/src/modules/ops/ops.service.ts`, change the imports at the top
from:

```ts
import { eq, sql } from 'drizzle-orm';

import type {
  IssueStrikeInput,
  PublishListingInput,
  ScheduleVisitInput,
  SyncVisitInput,
} from '@campushomes/shared';

import type { RlsContext } from '../../db/rls-context';
import { firstRow } from '../../db/client';
import { RlsDb } from '../../db/db.module';
import {
  landlordStrikes,
  listingVersions,
  listings,
  semesters,
  units,
  verificationVisits,
} from '../../db/schema';
import { AuditService } from './audit.service';
```

to:

```ts
import { and, eq, sql } from 'drizzle-orm';

import type {
  IssueStrikeInput,
  PublishListingInput,
  ScheduleVisitInput,
  SyncVisitInput,
} from '@campushomes/shared';

import type { RlsContext } from '../../db/rls-context';
import { firstRow } from '../../db/client';
import { RlsDb } from '../../db/db.module';
import {
  landlordStrikes,
  listingVersions,
  listings,
  opsStaff,
  semesters,
  units,
  users,
  verificationVisits,
} from '../../db/schema';
import { AuditService } from './audit.service';
```

Then add these four methods to `OpsService`, right after the existing
`queue()` method (before `scheduleVisit`):

```ts
  /** Inspector picker for the schedule-visit form. Ops-lead-only read. */
  listInspectors(ctx: RlsContext) {
    return this.rlsDb.run(ctx, async (db) =>
      db
        .select({ id: users.id, name: users.name, catchment: opsStaff.assignedCatchment })
        .from(opsStaff)
        .innerJoin(users, eq(opsStaff.userId, users.id))
        .where(and(eq(opsStaff.team, 'inspector'), eq(opsStaff.active, true))),
    );
  }

  /** An inspector's own assigned, not-yet-approved visits — their Inspection
   * Mode home screen. Not reusing queue(): that's property-shaped for leads,
   * and RLS-scoping verification_visits to the caller means a property
   * assigned to a *different* inspector would show as "no visit yet" here. */
  myVisits(ctx: RlsContext) {
    return this.rlsDb.run(ctx, async (_db, client) => {
      const res = await client.query(
        `SELECT vv.id AS visit_id, vv.property_id, vv.scheduled_at, vv.result,
                p.name AS property_name, p.street_address
         FROM verification_visits vv
         JOIN properties p ON p.id = vv.property_id
         WHERE vv.inspector_id = $1 AND vv.approved_at IS NULL
         ORDER BY vv.scheduled_at ASC NULLS LAST`,
        [ctx.userId],
      );
      return res.rows as unknown[];
    });
  }

  /** Full visit record for the lead's review-before-approve screen. */
  async visitDetail(ctx: RlsContext, visitId: string) {
    return this.rlsDb.run(ctx, async (db) => {
      const visit = await db.query.verificationVisits.findFirst({
        where: eq(verificationVisits.id, visitId),
      });
      if (!visit) {
        throw new NotFoundException('Visit not found');
      }
      return visit;
    });
  }

  /** Links an approved visit's property to the listing it should publish —
   * publishListingSchema takes a listingId, not a propertyId. */
  propertyListings(ctx: RlsContext, propertyId: string) {
    return this.rlsDb.run(ctx, async (db) =>
      db
        .select({ id: listings.id, status: listings.status, semesterId: listings.semesterId })
        .from(listings)
        .where(eq(listings.propertyId, propertyId)),
    );
  }
```

- [ ] **Step 4: Add the controller routes**

In `apps/api/src/modules/ops/ops.controller.ts`, add these four handlers
right after `queue()` and before `scheduleVisit()`. Order matters: `GET
visits/mine` must be declared before `GET visits/:id` or Express will match
`mine` as the `:id` param.

```ts
  @Get('inspectors')
  @Roles('ops_lead', 'admin')
  listInspectors(@Req() req: AuthenticatedRequest) {
    return this.ops.listInspectors(rlsCtx(req));
  }

  @Get('visits/mine')
  @Roles('ops_inspector')
  myVisits(@Req() req: AuthenticatedRequest) {
    return this.ops.myVisits(rlsCtx(req));
  }

  @Get('visits/:id')
  @Roles('ops_lead', 'admin')
  visitDetail(@Req() req: AuthenticatedRequest, @Param('id', ParseUUIDPipe) id: string) {
    return this.ops.visitDetail(rlsCtx(req), id);
  }

  @Get('properties/:id/listings')
  @Roles('ops_lead', 'admin')
  propertyListings(@Req() req: AuthenticatedRequest, @Param('id', ParseUUIDPipe) id: string) {
    return this.ops.propertyListings(rlsCtx(req), id);
  }
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `pnpm --filter @campushomes/api test -- test/services/ops-directory.spec.ts`
Expected: PASS, 6 tests.

- [ ] **Step 6: Typecheck and lint the API**

Run: `pnpm --filter @campushomes/api typecheck && pnpm --filter @campushomes/api lint`
Expected: both clean.

- [ ] **Step 7: Commit**

```bash
git add apps/api/src/modules/ops/ops.service.ts apps/api/src/modules/ops/ops.controller.ts apps/api/test/services/ops-directory.spec.ts
git commit -m "$(cat <<'EOF'
Add ops-facing lookup endpoints: inspectors, my visits, visit detail, property listings

Fills four gaps the Phase 5 frontend design found: no way to pick an
inspector when scheduling a visit, no inspector-scoped visit list (queue
is lead/property-shaped and RLS-masks other inspectors' visits as
unassigned), no way to review a checklist before approving, and no way
to find which listing belongs to an approved property.
EOF
)"
```

---

### Task 3: Frontend — Jest test infrastructure

`apps/web` has no test runner today. This adds one using Next's built-in
`next/jest` (SWC-based — no `ts-jest`/Babel config needed) so later tasks
can write real tests for the offline IndexedDB store and sync manager.

**Files:**
- Modify: `apps/web/package.json`
- Create: `apps/web/jest.config.ts`
- Create: `apps/web/src/lib/ops/__smoke__.test.ts` (deleted in Step 4 —
  exists only to prove the runner works before other tasks depend on it)

**Interfaces:**
- Consumes: nothing.
- Produces: a working `pnpm --filter @campushomes/web test` command; jsdom
  environment with `fake-indexeddb/auto` preloaded. Tasks 4 and 5 write real
  tests against this runner.

- [ ] **Step 1: Add devDependencies and the test script**

In `apps/web/package.json`, add `"test": "jest"` to `"scripts"`:

```jsonc
  "scripts": {
    "dev": "next dev",
    "build": "next build",
    "start": "next start",
    "lint": "eslint",
    "typecheck": "tsc --noEmit",
    "test": "jest"
  },
```

Add to `"devDependencies"`:

```jsonc
    "@types/jest": "^30.0.0",
    "fake-indexeddb": "^6.2.2",
    "jest": "^30.1.3",
    "jest-environment-jsdom": "^30.1.3",
```

Run: `pnpm install`
Expected: lockfile updates, install succeeds.

- [ ] **Step 2: Add the Jest config**

Create `apps/web/jest.config.ts`:

```ts
import type { Config } from "jest";
import nextJest from "next/jest";

const createJestConfig = nextJest({ dir: "./" });

const config: Config = {
  testEnvironment: "jest-environment-jsdom",
  setupFiles: ["fake-indexeddb/auto"],
  testPathIgnorePatterns: ["<rootDir>/.next/", "<rootDir>/node_modules/"],
};

export default createJestConfig(config);
```

- [ ] **Step 3: Write a smoke test and verify the runner works end to end**

Create `apps/web/src/lib/ops/__smoke__.test.ts`:

```ts
describe("jest infrastructure", () => {
  it("can see a real IndexedDB implementation from fake-indexeddb", () => {
    expect(typeof indexedDB.open).toBe("function");
  });
});
```

Run: `pnpm --filter @campushomes/web test`
Expected: PASS, 1 test.

- [ ] **Step 4: Delete the smoke test**

It's served its purpose — Tasks 4 and 5 add the real tests.

Run: `rm apps/web/src/lib/ops/__smoke__.test.ts`

- [ ] **Step 5: Commit**

```bash
git add apps/web/package.json apps/web/jest.config.ts pnpm-lock.yaml
git commit -m "$(cat <<'EOF'
Add Jest test infrastructure to apps/web

First test runner for the frontend — uses next/jest (SWC-based, no
ts-jest/Babel config) so Phase 5's offline IndexedDB store and sync
manager can have real tests.
EOF
)"
```

---

### Task 4: Frontend — IndexedDB draft store

**Files:**
- Create: `apps/web/src/lib/ops/inspection-db.ts`
- Test: `apps/web/src/lib/ops/inspection-db.test.ts`

**Interfaces:**
- Consumes: `VerificationChecklistComponent` (from `@campushomes/shared`,
  Task 1); `fake-indexeddb/auto` (Task 3, test-only).
- Produces: types `SyncStatus`, `InspectionDraft`; functions
  `getDraft(visitId)`, `putDraft(draft)`, `getQueuedDrafts()`. Task 5 (sync
  manager) and Task 15 (Inspection Mode form) both import from this file.

- [ ] **Step 1: Write the failing test**

Create `apps/web/src/lib/ops/inspection-db.test.ts`:

```ts
import { getDraft, getQueuedDrafts, putDraft, type InspectionDraft } from "./inspection-db";

function makeDraft(overrides: Partial<InspectionDraft> = {}): InspectionDraft {
  return {
    visitId: "visit-1",
    clientIdempotencyKey: "key-1",
    checklist: {
      location_gps: { passed: true, notes: "" },
      rooms_capacity: { passed: true, notes: "" },
      amenities: { passed: true, notes: "" },
      photos: { passed: true, notes: "" },
      landlord_identity: { passed: true, notes: "" },
      safety: { passed: true, notes: "" },
    },
    visitGpsLat: 0.33,
    visitGpsLon: 32.57,
    startedAt: new Date().toISOString(),
    completedAt: null,
    result: null,
    failureReason: "",
    syncStatus: "draft",
    ...overrides,
  };
}

describe("inspection-db", () => {
  it("returns undefined for a visit with no saved draft", async () => {
    const draft = await getDraft("missing-visit");
    expect(draft).toBeUndefined();
  });

  it("round-trips a saved draft", async () => {
    const saved = makeDraft();
    await putDraft(saved);
    const loaded = await getDraft("visit-1");
    expect(loaded).toEqual(saved);
  });

  it("returns only queued and failed drafts from getQueuedDrafts", async () => {
    await putDraft(makeDraft({ visitId: "visit-draft", syncStatus: "draft" }));
    await putDraft(makeDraft({ visitId: "visit-queued", syncStatus: "queued" }));
    await putDraft(makeDraft({ visitId: "visit-failed", syncStatus: "failed" }));
    await putDraft(makeDraft({ visitId: "visit-synced", syncStatus: "synced" }));

    const queued = await getQueuedDrafts();
    expect(queued.map((d) => d.visitId).sort()).toEqual(["visit-failed", "visit-queued"]);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm --filter @campushomes/web test -- inspection-db`
Expected: FAIL — cannot find module `./inspection-db`.

- [ ] **Step 3: Implement the IndexedDB wrapper**

Create `apps/web/src/lib/ops/inspection-db.ts`:

```ts
import type { VerificationChecklistComponent } from "@campushomes/shared";

export type SyncStatus = "draft" | "queued" | "syncing" | "synced" | "failed";

export interface InspectionDraft {
  visitId: string;
  clientIdempotencyKey: string;
  checklist: Record<VerificationChecklistComponent, { passed: boolean | null; notes: string }>;
  visitGpsLat: number | null;
  visitGpsLon: number | null;
  startedAt: string;
  completedAt: string | null;
  result: "passed" | "failed" | null;
  failureReason: string;
  syncStatus: SyncStatus;
}

const DB_NAME = "campushomes-ops";
const DB_VERSION = 1;
const STORE_NAME = "inspection-drafts";

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      req.result.createObjectStore(STORE_NAME, { keyPath: "visitId" });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function getDraft(visitId: string): Promise<InspectionDraft | undefined> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readonly");
    const req = tx.objectStore(STORE_NAME).get(visitId);
    req.onsuccess = () => resolve(req.result as InspectionDraft | undefined);
    req.onerror = () => reject(req.error);
  });
}

export async function putDraft(draft: InspectionDraft): Promise<void> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    tx.objectStore(STORE_NAME).put(draft);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function getQueuedDrafts(): Promise<InspectionDraft[]> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readonly");
    const req = tx.objectStore(STORE_NAME).getAll();
    req.onsuccess = () => {
      const all = req.result as InspectionDraft[];
      resolve(all.filter((d) => d.syncStatus === "queued" || d.syncStatus === "failed"));
    };
    req.onerror = () => reject(req.error);
  });
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm --filter @campushomes/web test -- inspection-db`
Expected: PASS, 3 tests.

- [ ] **Step 5: Typecheck**

Run: `pnpm --filter @campushomes/web typecheck`
Expected: clean.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/lib/ops/inspection-db.ts apps/web/src/lib/ops/inspection-db.test.ts
git commit -m "Add IndexedDB draft store for offline Inspection Mode checklists"
```

---

### Task 5: Frontend — Sync manager

**Files:**
- Create: `apps/web/src/lib/ops/sync-manager.ts`
- Test: `apps/web/src/lib/ops/sync-manager.test.ts`

**Interfaces:**
- Consumes: `getDraft`, `putDraft`, `getQueuedDrafts`, `InspectionDraft`
  (Task 4); `api`, `ApiError` (`apps/web/src/lib/api.ts`, unchanged);
  `SyncVisitInput` (`@campushomes/shared`, unchanged).
- Produces: `syncQueuedDrafts()`, `startSyncManager()`. Task 7
  (`SyncStatusIndicator`) and Task 15 (Inspection Mode form) both import
  from this file.

- [ ] **Step 1: Write the failing test**

Create `apps/web/src/lib/ops/sync-manager.test.ts`:

```ts
import { getDraft, putDraft, type InspectionDraft } from "./inspection-db";
import { syncQueuedDrafts } from "./sync-manager";

function queuedDraft(visitId: string): InspectionDraft {
  return {
    visitId,
    clientIdempotencyKey: `key-${visitId}`,
    checklist: {
      location_gps: { passed: true, notes: "" },
      rooms_capacity: { passed: true, notes: "" },
      amenities: { passed: true, notes: "" },
      photos: { passed: true, notes: "" },
      landlord_identity: { passed: true, notes: "" },
      safety: { passed: true, notes: "" },
    },
    visitGpsLat: 0.33,
    visitGpsLon: 32.57,
    startedAt: new Date().toISOString(),
    completedAt: new Date().toISOString(),
    result: "passed",
    failureReason: "",
    syncStatus: "queued",
  };
}

describe("syncQueuedDrafts", () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it("marks a successfully synced draft as synced", async () => {
    await putDraft(queuedDraft("visit-ok"));
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ id: "visit-ok" }),
    }) as unknown as typeof fetch;

    await syncQueuedDrafts();

    const updated = await getDraft("visit-ok");
    expect(updated?.syncStatus).toBe("synced");
  });

  it("marks a draft rejected with a 4xx as failed, not retried", async () => {
    await putDraft(queuedDraft("visit-bad"));
    global.fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 400,
      json: async () => ({ message: "bad request" }),
    }) as unknown as typeof fetch;

    await syncQueuedDrafts();

    const updated = await getDraft("visit-bad");
    expect(updated?.syncStatus).toBe("failed");
  });

  it("leaves a draft queued for retry after a network error", async () => {
    await putDraft(queuedDraft("visit-offline"));
    global.fetch = jest.fn().mockRejectedValue(new TypeError("Network request failed"));

    await syncQueuedDrafts();

    const updated = await getDraft("visit-offline");
    expect(updated?.syncStatus).toBe("queued");
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm --filter @campushomes/web test -- sync-manager`
Expected: FAIL — cannot find module `./sync-manager`.

- [ ] **Step 3: Implement the sync manager**

Create `apps/web/src/lib/ops/sync-manager.ts`:

```ts
import type { SyncVisitInput } from "@campushomes/shared";

import { api, ApiError } from "@/lib/api";
import { getQueuedDrafts, putDraft, type InspectionDraft } from "./inspection-db";

function toSyncPayload(draft: InspectionDraft): SyncVisitInput {
  if (draft.visitGpsLat === null || draft.visitGpsLon === null) {
    throw new Error("Cannot sync a draft with no GPS captured");
  }
  if (!draft.completedAt || !draft.result) {
    throw new Error("Cannot sync an incomplete draft");
  }
  return {
    clientIdempotencyKey: draft.clientIdempotencyKey,
    visitId: draft.visitId,
    checklist: draft.checklist as SyncVisitInput["checklist"],
    visitGpsLat: draft.visitGpsLat,
    visitGpsLon: draft.visitGpsLon,
    startedAt: draft.startedAt,
    completedAt: draft.completedAt,
    result: draft.result,
    failureReason: draft.failureReason || undefined,
  };
}

async function syncOne(draft: InspectionDraft): Promise<void> {
  await putDraft({ ...draft, syncStatus: "syncing" });
  try {
    await api("/ops/visits/sync", {
      method: "POST",
      body: JSON.stringify(toSyncPayload(draft)),
    });
    await putDraft({ ...draft, syncStatus: "synced" });
  } catch (err) {
    const isClientError = err instanceof ApiError && err.status >= 400 && err.status < 500;
    await putDraft({ ...draft, syncStatus: isClientError ? "failed" : "queued" });
  }
}

/** Drains every queued/failed draft, one at a time. Safe to call
 * concurrently with itself — each call re-reads the queue fresh. */
export async function syncQueuedDrafts(): Promise<void> {
  const drafts = await getQueuedDrafts();
  for (const draft of drafts) {
    await syncOne(draft);
  }
}

/** In-page sync trigger (no Service Worker — that's Phase 7). Drains on
 * 'online', on a 30s fallback interval, and once immediately. Returns a
 * cleanup function. */
export function startSyncManager(): () => void {
  const onOnline = () => {
    void syncQueuedDrafts();
  };
  window.addEventListener("online", onOnline);
  const interval = setInterval(() => void syncQueuedDrafts(), 30_000);
  void syncQueuedDrafts();
  return () => {
    window.removeEventListener("online", onOnline);
    clearInterval(interval);
  };
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm --filter @campushomes/web test -- sync-manager`
Expected: PASS, 3 tests.

- [ ] **Step 5: Typecheck**

Run: `pnpm --filter @campushomes/web typecheck`
Expected: clean.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/lib/ops/sync-manager.ts apps/web/src/lib/ops/sync-manager.test.ts
git commit -m "Add in-page sync manager to drain queued Inspection Mode checklists"
```

---

### Task 6: Frontend — Textarea UI primitive

**Files:**
- Create: `apps/web/src/components/ui/textarea.tsx`

**Interfaces:**
- Consumes: `cn` (`apps/web/src/lib/utils.ts`, unchanged).
- Produces: `Textarea` component. Used by Tasks 12, 13, and 15 (publish
  description, strike notes, checklist/failure notes).

- [ ] **Step 1: Create the component**

Matches `apps/web/src/components/ui/input.tsx`'s exact pattern:

```tsx
import { cn } from "@/lib/utils";

function Textarea({ className, ...props }: React.ComponentProps<"textarea">) {
  return (
    <textarea
      className={cn(
        "flex min-h-20 w-full rounded-md border border-input bg-background px-3 py-2 text-base text-foreground shadow-xs transition-colors duration-150 placeholder:text-muted-foreground focus-visible:border-ring focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-destructive sm:text-sm",
        className,
      )}
      {...props}
    />
  );
}

export { Textarea };
```

- [ ] **Step 2: Typecheck**

Run: `pnpm --filter @campushomes/web typecheck`
Expected: clean (nothing imports it yet, but it must compile standalone).

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/components/ui/textarea.tsx
git commit -m "Add Textarea UI primitive"
```

---

### Task 7: Frontend — PortalShell header slot + offline indicator + ops layout wiring

**Files:**
- Modify: `apps/web/src/components/shell/portal-shell.tsx`
- Create: `apps/web/src/components/ops/sync-status-indicator.tsx`
- Modify: `apps/web/src/app/(ops)/layout.tsx`

**Interfaces:**
- Consumes: `startSyncManager` (Task 5); `cn` (unchanged).
- Produces: `PortalShell` gains an optional `headerExtra` prop (other
  portals unaffected — nothing passes it, so it renders nothing for
  student/landlord); ops layout renders role-specific nav and mounts the
  indicator for inspectors only.

- [ ] **Step 1: Add the `headerExtra` prop to PortalShell**

In `apps/web/src/components/shell/portal-shell.tsx`, change the props type
and destructuring from:

```tsx
function PortalShell({
  portalLabel,
  nav,
  user,
  children,
}: {
  portalLabel: string;
  nav: PortalNavItem[];
  user: SessionUser;
  children: React.ReactNode;
}) {
```

to:

```tsx
function PortalShell({
  portalLabel,
  nav,
  user,
  headerExtra,
  children,
}: {
  portalLabel: string;
  nav: PortalNavItem[];
  user: SessionUser;
  headerExtra?: React.ReactNode;
  children: React.ReactNode;
}) {
```

Then change the nav block from:

```tsx
          <nav className="ml-auto flex items-center gap-1">
            {nav.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "rounded-md px-3 py-2 text-sm font-semibold text-muted-foreground transition-colors hover:bg-muted hover:text-foreground",
                )}
              >
                {item.label}
              </Link>
            ))}
            <SignOutButton />
          </nav>
```

to:

```tsx
          <nav className="ml-auto flex items-center gap-1">
            {nav.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "rounded-md px-3 py-2 text-sm font-semibold text-muted-foreground transition-colors hover:bg-muted hover:text-foreground",
                )}
              >
                {item.label}
              </Link>
            ))}
            {headerExtra}
            <SignOutButton />
          </nav>
```

- [ ] **Step 2: Create the online/offline indicator**

Create `apps/web/src/components/ops/sync-status-indicator.tsx`:

```tsx
"use client";

import { useEffect, useState } from "react";
import { Wifi, WifiOff } from "lucide-react";

import { startSyncManager } from "@/lib/ops/sync-manager";
import { cn } from "@/lib/utils";

/** Mounted once in the ops layout for inspectors — starts the sync manager
 * for the lifetime of any (ops) page and shows connectivity state. */
function SyncStatusIndicator() {
  const [online, setOnline] = useState(true);

  useEffect(() => {
    setOnline(navigator.onLine);
    const goOnline = () => setOnline(true);
    const goOffline = () => setOnline(false);
    window.addEventListener("online", goOnline);
    window.addEventListener("offline", goOffline);
    const stopSync = startSyncManager();
    return () => {
      window.removeEventListener("online", goOnline);
      window.removeEventListener("offline", goOffline);
      stopSync();
    };
  }, []);

  return (
    <span
      role="status"
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold",
        online ? "bg-success-subtle text-success" : "bg-warning-subtle text-warning",
      )}
    >
      {online ? (
        <Wifi aria-hidden className="size-3.5" />
      ) : (
        <WifiOff aria-hidden className="size-3.5" />
      )}
      {online ? "Online" : "Offline — will sync"}
    </span>
  );
}

export { SyncStatusIndicator };
```

- [ ] **Step 3: Wire it into the ops layout with role-specific nav**

Replace the full contents of `apps/web/src/app/(ops)/layout.tsx`:

```tsx
import { requireRole } from "@/lib/session";
import { PortalShell } from "@/components/shell/portal-shell";
import { SyncStatusIndicator } from "@/components/ops/sync-status-indicator";

export default async function OpsLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const session = await requireRole(["ops_inspector", "ops_lead", "admin"]);
  const isInspector = session.user.role === "ops_inspector";

  return (
    <PortalShell
      portalLabel={isInspector ? "Ops · Inspector" : "Ops · Lead"}
      user={session.user}
      nav={
        isInspector
          ? [{ label: "My visits", href: "/ops/inspect" }]
          : [
              { label: "Verification queue", href: "/ops" },
              { label: "Issue strike", href: "/ops/strikes" },
            ]
      }
      headerExtra={isInspector ? <SyncStatusIndicator /> : undefined}
    >
      {children}
    </PortalShell>
  );
}
```

- [ ] **Step 4: Typecheck**

Run: `pnpm --filter @campushomes/web typecheck`
Expected: clean.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/components/shell/portal-shell.tsx apps/web/src/components/ops/sync-status-indicator.tsx "apps/web/src/app/(ops)/layout.tsx"
git commit -m "Wire ops layout: role-specific nav + inspector offline indicator"
```

---

### Task 8: Frontend — `lib/ops.ts` server-fetch helpers

**Files:**
- Create: `apps/web/src/lib/ops.ts`

**Interfaces:**
- Consumes: `apiServer` (`apps/web/src/lib/server-api.ts`, unchanged);
  `OpsInspector`, `OpsPropertyListing`, `OpsQueueRow`, `OpsVisitDetail`,
  `OpsVisitMine` (Task 1); backend routes from Task 2.
- Produces: `getQueue()`, `getInspectors()`, `getMyVisits()`,
  `getVisitDetail(visitId)`, `getPropertyListings(propertyId)`. Tasks 9–14
  import from this file.

- [ ] **Step 1: Create the file**

Matches `apps/web/src/lib/landlord.ts` and `reservations.ts`'s exact
pattern:

```ts
import type {
  OpsInspector,
  OpsPropertyListing,
  OpsQueueRow,
  OpsVisitDetail,
  OpsVisitMine,
} from "@campushomes/shared";

import { apiServer } from "@/lib/server-api";

export function getQueue(): Promise<OpsQueueRow[]> {
  return apiServer<OpsQueueRow[]>("/ops/queue").then((rows) => rows ?? []);
}

export function getInspectors(): Promise<OpsInspector[]> {
  return apiServer<OpsInspector[]>("/ops/inspectors").then((rows) => rows ?? []);
}

export function getMyVisits(): Promise<OpsVisitMine[]> {
  return apiServer<OpsVisitMine[]>("/ops/visits/mine").then((rows) => rows ?? []);
}

export function getVisitDetail(visitId: string): Promise<OpsVisitDetail | null> {
  return apiServer<OpsVisitDetail>(`/ops/visits/${visitId}`);
}

export function getPropertyListings(propertyId: string): Promise<OpsPropertyListing[]> {
  return apiServer<OpsPropertyListing[]>(`/ops/properties/${propertyId}/listings`).then(
    (rows) => rows ?? [],
  );
}
```

- [ ] **Step 2: Typecheck**

Run: `pnpm --filter @campushomes/web typecheck`
Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/lib/ops.ts
git commit -m "Add server-fetch helpers for the ops portal"
```

---

### Task 9: Frontend — Ops-lead queue page

**Files:**
- Modify: `apps/web/src/app/(ops)/ops/page.tsx` (currently a static
  placeholder — see Phase 3/4 note in it)

**Interfaces:**
- Consumes: `getQueue` (Task 8); `getServerSession` (`lib/session.ts`,
  unchanged); `OpsQueueRow` (Task 1).
- Produces: nothing consumed by later tasks (leaf page), but its "Schedule"
  link points to `/ops/visits/schedule?propertyId=…` (Task 10) and its
  "View" link points to `/ops/visits/:id` (Task 11).

- [ ] **Step 1: Replace the placeholder page**

Replace the full contents of `apps/web/src/app/(ops)/ops/page.tsx`:

```tsx
import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ClipboardCheck } from "lucide-react";
import type { OpsQueueRow } from "@campushomes/shared";

import { Card, CardContent } from "@/components/ui/card";
import { EmptyState } from "@/components/empty-state";
import { StatusChip } from "@/components/status-chip";
import { getServerSession } from "@/lib/session";
import { getQueue } from "@/lib/ops";

export const metadata: Metadata = { title: "Verification queue" };

function ageTone(ageHours: number): "success" | "warning" | "destructive" {
  if (ageHours > 96) return "destructive";
  if (ageHours > 48) return "warning";
  return "success";
}

function QueueRow({ row }: { row: OpsQueueRow }) {
  const hasVisit = row.visit_id !== null;
  return (
    <Card>
      <CardContent className="flex flex-wrap items-center justify-between gap-3 p-5">
        <div>
          <p className="font-semibold text-foreground">{row.name}</p>
          <p className="text-sm text-muted-foreground">{row.street_address}</p>
        </div>
        <div className="flex items-center gap-3">
          <StatusChip tone={ageTone(row.age_hours)}>{Math.round(row.age_hours)}h old</StatusChip>
          <Link
            href={
              hasVisit ? `/ops/visits/${row.visit_id}` : `/ops/visits/schedule?propertyId=${row.id}`
            }
            className="inline-flex h-9 items-center rounded-md bg-primary px-3 text-sm font-semibold text-primary-foreground shadow-xs transition-colors duration-150 hover:bg-teal-700"
          >
            {hasVisit ? "View" : "Schedule"}
          </Link>
        </div>
      </CardContent>
    </Card>
  );
}

export default async function OpsQueuePage() {
  const session = await getServerSession();
  if (session?.user.role === "ops_inspector") {
    redirect("/ops/inspect");
  }

  const queue = await getQueue();

  return (
    <>
      <h1 className="text-2xl">Verification queue</h1>
      {queue.length === 0 ? (
        <div className="mt-6">
          <EmptyState
            icon={ClipboardCheck}
            title="The queue is clear"
            body="New verification requests appear here with their SLA age. Leads schedule visits; inspectors run the 6-component checklist on site — offline if they have to."
          />
        </div>
      ) : (
        <div className="mt-6 space-y-3">
          {queue.map((row) => (
            <QueueRow key={row.id} row={row} />
          ))}
        </div>
      )}
    </>
  );
}
```

- [ ] **Step 2: Typecheck and lint**

Run: `pnpm --filter @campushomes/web typecheck && pnpm --filter @campushomes/web lint`
Expected: both clean.

- [ ] **Step 3: Commit**

```bash
git add "apps/web/src/app/(ops)/ops/page.tsx"
git commit -m "Wire the ops-lead verification queue page to GET /ops/queue"
```

---

### Task 10: Frontend — Schedule-visit page

**Files:**
- Create: `apps/web/src/app/(ops)/ops/visits/schedule/page.tsx`
- Create: `apps/web/src/app/(ops)/ops/visits/schedule/schedule-visit-form.tsx`

**Interfaces:**
- Consumes: `getInspectors` (Task 8); `OpsInspector` (Task 1); `api`,
  `ApiError` (`lib/api.ts`, unchanged).
- Produces: nothing consumed by later tasks (leaf page).

- [ ] **Step 1: Create the page (reads `?propertyId=` from the queue link)**

Create `apps/web/src/app/(ops)/ops/visits/schedule/page.tsx`:

```tsx
import type { Metadata } from "next";

import { getInspectors } from "@/lib/ops";
import { ScheduleVisitForm } from "./schedule-visit-form";

export const metadata: Metadata = { title: "Schedule visit" };

export default async function ScheduleVisitPage({
  searchParams,
}: {
  searchParams: Promise<{ propertyId?: string }>;
}) {
  const { propertyId } = await searchParams;
  const inspectors = await getInspectors();

  return (
    <>
      <h1 className="text-2xl">Schedule a visit</h1>
      <div className="mt-6 max-w-md">
        <ScheduleVisitForm propertyId={propertyId ?? ""} inspectors={inspectors} />
      </div>
    </>
  );
}
```

- [ ] **Step 2: Create the form**

Create `apps/web/src/app/(ops)/ops/visits/schedule/schedule-visit-form.tsx`.
Follows `student-profile-form.tsx`'s exact pattern (plain `useState`, native
`<select>`, no `react-hook-form`):

```tsx
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { OpsInspector } from "@campushomes/shared";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { api, ApiError } from "@/lib/api";
import { cn } from "@/lib/utils";

function errorMessage(err: unknown, fallback: string): string {
  if (err instanceof ApiError) {
    const body = err.body as { message?: string | string[] } | null;
    if (typeof body?.message === "string") return body.message;
    if (Array.isArray(body?.message)) return body.message.join(", ");
  }
  return fallback;
}

export function ScheduleVisitForm({
  propertyId,
  inspectors,
}: {
  propertyId: string;
  inspectors: OpsInspector[];
}) {
  const router = useRouter();
  const [inspectorId, setInspectorId] = useState("");
  const [scheduledAt, setScheduledAt] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!propertyId || !inspectorId || !scheduledAt) return;
    setError(null);
    setPending(true);
    try {
      await api("/ops/visits", {
        method: "POST",
        body: JSON.stringify({
          propertyId,
          inspectorId,
          scheduledAt: new Date(scheduledAt).toISOString(),
        }),
      });
      router.push("/ops");
      router.refresh();
    } catch (err) {
      setError(errorMessage(err, "Couldn't schedule the visit — try again."));
      setPending(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <div className="space-y-1.5">
        <Label htmlFor="inspector">Inspector</Label>
        <select
          id="inspector"
          required
          value={inspectorId}
          onChange={(e) => setInspectorId(e.target.value)}
          className={cn(
            "flex h-11 w-full rounded-md border border-input bg-background px-3 text-base text-foreground shadow-xs transition-colors duration-150",
            "focus-visible:border-ring focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring sm:h-10",
          )}
        >
          <option value="" disabled>
            Select an inspector
          </option>
          {inspectors.map((inspector) => (
            <option key={inspector.id} value={inspector.id}>
              {inspector.name} ({inspector.catchment})
            </option>
          ))}
        </select>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="scheduledAt">Scheduled for</Label>
        <Input
          id="scheduledAt"
          type="datetime-local"
          required
          value={scheduledAt}
          onChange={(e) => setScheduledAt(e.target.value)}
        />
      </div>
      <Button type="submit" disabled={pending || !propertyId} className="w-full">
        {pending ? "Scheduling…" : "Schedule visit"}
      </Button>
      <p role="status" className="min-h-5 text-sm text-destructive">
        {error}
      </p>
    </form>
  );
}
```

- [ ] **Step 3: Typecheck and lint**

Run: `pnpm --filter @campushomes/web typecheck && pnpm --filter @campushomes/web lint`
Expected: both clean.

- [ ] **Step 4: Commit**

```bash
git add "apps/web/src/app/(ops)/ops/visits/schedule"
git commit -m "Add ops-lead schedule-visit page"
```

---

### Task 11: Frontend — Visit-detail page + approve action

**Files:**
- Create: `apps/web/src/app/(ops)/ops/visits/[id]/page.tsx`
- Create: `apps/web/src/app/(ops)/ops/visits/[id]/approve-visit-button.tsx`

**Interfaces:**
- Consumes: `getVisitDetail`, `getPropertyListings` (Task 8);
  `OpsVisitDetail` (Task 1); `VERIFICATION_CHECKLIST_COMPONENTS`,
  `VerificationChecklistComponent` (`@campushomes/shared`, unchanged); `api`
  (unchanged).
- Produces: links to `/ops/publish/:listingId` (Task 12).

- [ ] **Step 1: Create the approve button**

Create `apps/web/src/app/(ops)/ops/visits/[id]/approve-visit-button.tsx`.
Matches `reservations-list.tsx`'s `CancelButton`/`MoveInButton` pattern
(client mutation + `router.refresh()`):

```tsx
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { api } from "@/lib/api";

export function ApproveVisitButton({ visitId }: { visitId: string }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);

  async function approve() {
    setPending(true);
    try {
      await api(`/ops/visits/${visitId}/approve`, { method: "POST" });
      router.refresh();
    } finally {
      setPending(false);
    }
  }

  return (
    <Button type="button" disabled={pending} onClick={approve}>
      {pending ? "Approving…" : "Approve"}
    </Button>
  );
}
```

- [ ] **Step 2: Create the page**

Create `apps/web/src/app/(ops)/ops/visits/[id]/page.tsx`:

```tsx
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
import {
  VERIFICATION_CHECKLIST_COMPONENTS,
  type VerificationChecklistComponent,
} from "@campushomes/shared";

import { Card, CardContent } from "@/components/ui/card";
import { StatusChip } from "@/components/status-chip";
import { getPropertyListings, getVisitDetail } from "@/lib/ops";
import { ApproveVisitButton } from "./approve-visit-button";

export const metadata: Metadata = { title: "Visit review" };

const COMPONENT_LABEL: Record<VerificationChecklistComponent, string> = {
  location_gps: "Location & GPS",
  rooms_capacity: "Rooms & capacity",
  amenities: "Amenities",
  photos: "Photos match property",
  landlord_identity: "Landlord identity",
  safety: "Safety",
};

export default async function VisitDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const visit = await getVisitDetail(id);
  if (!visit) {
    notFound();
  }

  const listings = visit.approvedAt ? await getPropertyListings(visit.propertyId) : [];

  return (
    <>
      <h1 className="text-2xl">Visit review</h1>
      <div className="mt-6 space-y-3">
        <Card>
          <CardContent className="flex flex-wrap items-center justify-between gap-3 p-5">
            <div>
              <StatusChip
                tone={
                  visit.result === "passed"
                    ? "success"
                    : visit.result === "failed"
                      ? "destructive"
                      : "neutral"
                }
              >
                {visit.result}
              </StatusChip>
              {visit.visitGpsLat && visit.visitGpsLon && (
                <p className="mt-2 text-sm text-muted-foreground">
                  GPS {visit.visitGpsLat}, {visit.visitGpsLon}
                </p>
              )}
            </div>
            {visit.result === "passed" && !visit.approvedAt && (
              <ApproveVisitButton visitId={visit.id} />
            )}
            {visit.approvedAt && <StatusChip tone="success">Approved</StatusChip>}
          </CardContent>
        </Card>

        {VERIFICATION_CHECKLIST_COMPONENTS.map((component) => {
          const entry = visit.checklist[component];
          return (
            <Card key={component}>
              <CardContent className="p-5">
                <div className="flex items-center justify-between">
                  <p className="font-semibold text-foreground">{COMPONENT_LABEL[component]}</p>
                  {entry && (
                    <StatusChip tone={entry.passed ? "success" : "destructive"}>
                      {entry.passed ? "Pass" : "Fail"}
                    </StatusChip>
                  )}
                </div>
                {entry?.notes && (
                  <p className="mt-2 text-sm text-muted-foreground">{entry.notes}</p>
                )}
              </CardContent>
            </Card>
          );
        })}

        {visit.approvedAt && listings.length > 0 && (
          <Card>
            <CardContent className="flex items-center justify-between gap-3 p-5">
              <p className="text-sm text-muted-foreground">Ready to publish</p>
              <Link
                href={`/ops/publish/${listings[0].id}`}
                className="inline-flex h-9 items-center rounded-md bg-primary px-3 text-sm font-semibold text-primary-foreground shadow-xs transition-colors duration-150 hover:bg-teal-700"
              >
                Publish
              </Link>
            </CardContent>
          </Card>
        )}
      </div>
    </>
  );
}
```

- [ ] **Step 3: Typecheck and lint**

Run: `pnpm --filter @campushomes/web typecheck && pnpm --filter @campushomes/web lint`
Expected: both clean.

- [ ] **Step 4: Commit**

```bash
git add "apps/web/src/app/(ops)/ops/visits/[id]"
git commit -m "Add ops-lead visit-detail page with checklist review and approve"
```

---

### Task 12: Frontend — Publish page

**Files:**
- Create: `apps/web/src/app/(ops)/ops/publish/[listingId]/page.tsx`
- Create: `apps/web/src/app/(ops)/ops/publish/[listingId]/publish-listing-form.tsx`

**Interfaces:**
- Consumes: `Textarea` (Task 6); `api`, `ApiError` (unchanged).
- Produces: nothing consumed by later tasks (leaf page).

- [ ] **Step 1: Create the page**

Create `apps/web/src/app/(ops)/ops/publish/[listingId]/page.tsx`:

```tsx
import type { Metadata } from "next";

import { PublishListingForm } from "./publish-listing-form";

export const metadata: Metadata = { title: "Publish listing" };

export default async function PublishListingPage({
  params,
}: {
  params: Promise<{ listingId: string }>;
}) {
  const { listingId } = await params;
  return (
    <>
      <h1 className="text-2xl">Publish listing</h1>
      <div className="mt-6 max-w-lg">
        <PublishListingForm listingId={listingId} />
      </div>
    </>
  );
}
```

- [ ] **Step 2: Create the form**

Create
`apps/web/src/app/(ops)/ops/publish/[listingId]/publish-listing-form.tsx`.
`amenities` is a free-form `Record<string, boolean>` server-side (no
canonical enum exists — confirmed in `listings/[id]/page.tsx`, which just
renders whatever keys are present via `humanizeKey`); this form offers a
fixed common set as an MVP default, not an exhaustive list:

```tsx
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { api, ApiError } from "@/lib/api";

const AMENITY_OPTIONS: Array<{ key: string; label: string }> = [
  { key: "water_supply", label: "Water supply" },
  { key: "power_backup", label: "Power backup" },
  { key: "wifi", label: "Wi-Fi" },
  { key: "security_guard", label: "Security guard" },
  { key: "parking", label: "Parking" },
  { key: "furnished", label: "Furnished" },
];

function errorMessage(err: unknown, fallback: string): string {
  if (err instanceof ApiError) {
    const body = err.body as { message?: string | string[] } | null;
    if (typeof body?.message === "string") return body.message;
    if (Array.isArray(body?.message)) return body.message.join(", ");
  }
  return fallback;
}

export function PublishListingForm({ listingId }: { listingId: string }) {
  const router = useRouter();
  const [price, setPrice] = useState("");
  const [description, setDescription] = useState("");
  const [amenities, setAmenities] = useState<Record<string, boolean>>({});
  const [unitLabels, setUnitLabels] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!price) return;
    setError(null);
    setPending(true);
    try {
      const units = unitLabels
        .split("\n")
        .map((label) => label.trim())
        .filter(Boolean)
        .map((label) => ({ label, capacity: 1 }));
      await api("/ops/listings/publish", {
        method: "POST",
        body: JSON.stringify({
          listingId,
          pricePerTermUgx: Number(price),
          amenities,
          description: description || undefined,
          units,
        }),
      });
      router.push("/ops");
      router.refresh();
    } catch (err) {
      setError(errorMessage(err, "Couldn't publish the listing — try again."));
      setPending(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <div className="space-y-1.5">
        <Label htmlFor="price">Price per term (UGX)</Label>
        <Input
          id="price"
          type="number"
          min={1}
          required
          value={price}
          onChange={(e) => setPrice(e.target.value)}
        />
      </div>
      <div className="space-y-1.5">
        <Label>Amenities</Label>
        <div className="grid grid-cols-2 gap-2">
          {AMENITY_OPTIONS.map((option) => (
            <label key={option.key} className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={amenities[option.key] ?? false}
                onChange={(e) =>
                  setAmenities((prev) => ({ ...prev, [option.key]: e.target.checked }))
                }
              />
              {option.label}
            </label>
          ))}
        </div>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="description">Description (optional)</Label>
        <Textarea
          id="description"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
        />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="units">Units (one label per line, e.g. &quot;Room 1A&quot;)</Label>
        <Textarea
          id="units"
          value={unitLabels}
          onChange={(e) => setUnitLabels(e.target.value)}
          placeholder={"Room 1A\nRoom 1B"}
        />
      </div>
      <Button type="submit" disabled={pending} className="w-full">
        {pending ? "Publishing…" : "Publish listing"}
      </Button>
      <p role="status" className="min-h-5 text-sm text-destructive">
        {error}
      </p>
    </form>
  );
}
```

- [ ] **Step 3: Typecheck and lint**

Run: `pnpm --filter @campushomes/web typecheck && pnpm --filter @campushomes/web lint`
Expected: both clean.

- [ ] **Step 4: Commit**

```bash
git add "apps/web/src/app/(ops)/ops/publish"
git commit -m "Add ops-lead publish-listing page"
```

---

### Task 13: Frontend — Strikes page

**Files:**
- Create: `apps/web/src/app/(ops)/ops/strikes/page.tsx`
- Create: `apps/web/src/app/(ops)/ops/strikes/issue-strike-form.tsx`

**Interfaces:**
- Consumes: `Textarea` (Task 6); `STRIKE_REASONS`, `StrikeReason`
  (`@campushomes/shared`, Task 1); `api`, `ApiError` (unchanged).
- Produces: nothing consumed by later tasks (leaf page). Its nav entry was
  already added in Task 7.

- [ ] **Step 1: Create the page**

Create `apps/web/src/app/(ops)/ops/strikes/page.tsx`:

```tsx
import type { Metadata } from "next";

import { IssueStrikeForm } from "./issue-strike-form";

export const metadata: Metadata = { title: "Issue landlord strike" };

export default function StrikesPage() {
  return (
    <>
      <h1 className="text-2xl">Issue a landlord strike</h1>
      <div className="mt-6 max-w-md">
        <IssueStrikeForm />
      </div>
    </>
  );
}
```

- [ ] **Step 2: Create the form**

Create `apps/web/src/app/(ops)/ops/strikes/issue-strike-form.tsx`:

```tsx
"use client";

import { useState } from "react";
import { STRIKE_REASONS, type StrikeReason } from "@campushomes/shared";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { api, ApiError } from "@/lib/api";
import { cn } from "@/lib/utils";

const REASON_LABEL: Record<StrikeReason, string> = {
  no_show: "No-show for a scheduled visit",
  price_mismatch: "Price mismatch vs. listing",
  amenity_fraud: "Amenity fraud",
  abusive: "Abusive behavior",
  other: "Other",
};

function errorMessage(err: unknown, fallback: string): string {
  if (err instanceof ApiError) {
    const body = err.body as { message?: string | string[] } | null;
    if (typeof body?.message === "string") return body.message;
    if (Array.isArray(body?.message)) return body.message.join(", ");
  }
  return fallback;
}

export function IssueStrikeForm() {
  const [landlordId, setLandlordId] = useState("");
  const [reason, setReason] = useState<StrikeReason | "">("");
  const [notes, setNotes] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!landlordId || !reason) return;
    setError(null);
    setPending(true);
    try {
      await api("/ops/strikes", {
        method: "POST",
        body: JSON.stringify({ landlordId, reason, notes: notes || undefined }),
      });
      setDone(true);
    } catch (err) {
      setError(errorMessage(err, "Couldn't issue the strike — try again."));
      setPending(false);
    }
  }

  if (done) {
    return <p className="text-sm text-success">Strike issued.</p>;
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <div className="space-y-1.5">
        <Label htmlFor="landlordId">Landlord ID</Label>
        <Input
          id="landlordId"
          required
          value={landlordId}
          onChange={(e) => setLandlordId(e.target.value)}
        />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="reason">Reason</Label>
        <select
          id="reason"
          required
          value={reason}
          onChange={(e) => setReason(e.target.value as StrikeReason)}
          className={cn(
            "flex h-11 w-full rounded-md border border-input bg-background px-3 text-base text-foreground shadow-xs transition-colors duration-150",
            "focus-visible:border-ring focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring sm:h-10",
          )}
        >
          <option value="" disabled>
            Select a reason
          </option>
          {STRIKE_REASONS.map((r) => (
            <option key={r} value={r}>
              {REASON_LABEL[r]}
            </option>
          ))}
        </select>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="notes">Notes (optional)</Label>
        <Textarea id="notes" value={notes} onChange={(e) => setNotes(e.target.value)} />
      </div>
      <Button type="submit" disabled={pending} className="w-full">
        {pending ? "Issuing…" : "Issue strike"}
      </Button>
      <p role="status" className="min-h-5 text-sm text-destructive">
        {error}
      </p>
    </form>
  );
}
```

- [ ] **Step 3: Typecheck and lint**

Run: `pnpm --filter @campushomes/web typecheck && pnpm --filter @campushomes/web lint`
Expected: both clean.

- [ ] **Step 4: Commit**

```bash
git add "apps/web/src/app/(ops)/ops/strikes"
git commit -m "Add ops-lead issue-strike page"
```

---

### Task 14: Frontend — Inspector "my visits" list page

**Files:**
- Create: `apps/web/src/app/(ops)/ops/inspect/page.tsx`
- Create: `apps/web/src/app/(ops)/ops/inspect/my-visits-list.tsx`

**Interfaces:**
- Consumes: `getMyVisits` (Task 8); `OpsVisitMine` (Task 1); `getDraft`,
  `SyncStatus` (Task 4); `StatusChip` (unchanged).
- Produces: links to `/ops/inspect/:visitId` (Task 15).

- [ ] **Step 1: Create the page**

Create `apps/web/src/app/(ops)/ops/inspect/page.tsx`:

```tsx
import type { Metadata } from "next";
import { ClipboardList } from "lucide-react";

import { EmptyState } from "@/components/empty-state";
import { getMyVisits } from "@/lib/ops";
import { MyVisitsList } from "./my-visits-list";

export const metadata: Metadata = { title: "My visits" };

export default async function MyVisitsPage() {
  const visits = await getMyVisits();

  return (
    <>
      <h1 className="text-2xl">My visits</h1>
      {visits.length === 0 ? (
        <div className="mt-6">
          <EmptyState
            icon={ClipboardList}
            title="No visits assigned"
            body="Scheduled verification visits appear here. Tap one to run the 6-component checklist — it works offline too."
          />
        </div>
      ) : (
        <MyVisitsList visits={visits} />
      )}
    </>
  );
}
```

- [ ] **Step 2: Create the list, overlaying local sync status per visit**

Create `apps/web/src/app/(ops)/ops/inspect/my-visits-list.tsx`:

```tsx
"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import type { OpsVisitMine } from "@campushomes/shared";

import { Card, CardContent } from "@/components/ui/card";
import { StatusChip } from "@/components/status-chip";
import { getDraft, type SyncStatus } from "@/lib/ops/inspection-db";

const STATUS_LABEL: Record<SyncStatus, string> = {
  draft: "In progress",
  queued: "Queued — will sync",
  syncing: "Syncing…",
  synced: "Synced",
  failed: "Sync failed",
};

const STATUS_TONE: Record<SyncStatus, "success" | "warning" | "destructive" | "neutral"> = {
  draft: "neutral",
  queued: "warning",
  syncing: "warning",
  synced: "success",
  failed: "destructive",
};

function VisitRow({ visit }: { visit: OpsVisitMine }) {
  const [localStatus, setLocalStatus] = useState<SyncStatus | null>(null);

  useEffect(() => {
    let cancelled = false;
    getDraft(visit.visit_id).then((draft) => {
      if (!cancelled) setLocalStatus(draft?.syncStatus ?? null);
    });
    return () => {
      cancelled = true;
    };
  }, [visit.visit_id]);

  return (
    <Link href={`/ops/inspect/${visit.visit_id}`}>
      <Card className="transition-colors hover:bg-muted">
        <CardContent className="flex items-center justify-between gap-3 p-5">
          <div>
            <p className="font-semibold text-foreground">{visit.property_name}</p>
            <p className="text-sm text-muted-foreground">{visit.street_address}</p>
          </div>
          {localStatus && (
            <StatusChip tone={STATUS_TONE[localStatus]}>{STATUS_LABEL[localStatus]}</StatusChip>
          )}
        </CardContent>
      </Card>
    </Link>
  );
}

export function MyVisitsList({ visits }: { visits: OpsVisitMine[] }) {
  return (
    <div className="mt-6 space-y-3">
      {visits.map((visit) => (
        <VisitRow key={visit.visit_id} visit={visit} />
      ))}
    </div>
  );
}
```

- [ ] **Step 3: Typecheck and lint**

Run: `pnpm --filter @campushomes/web typecheck && pnpm --filter @campushomes/web lint`
Expected: both clean.

- [ ] **Step 4: Commit**

```bash
git add "apps/web/src/app/(ops)/ops/inspect/page.tsx" "apps/web/src/app/(ops)/ops/inspect/my-visits-list.tsx"
git commit -m "Add inspector 'my visits' home screen"
```

---

### Task 15: Frontend — Inspection Mode checklist page

The biggest single piece: full-screen, offline-capable, GPS-assisted
6-component checklist capture.

**Files:**
- Create: `apps/web/src/app/(ops)/ops/inspect/[visitId]/page.tsx`
- Create: `apps/web/src/app/(ops)/ops/inspect/[visitId]/inspection-form.tsx`

**Interfaces:**
- Consumes: `getDraft`, `putDraft`, `InspectionDraft` (Task 4);
  `syncQueuedDrafts` (Task 5); `Textarea` (Task 6); `getMyVisits`
  (`lib/ops.ts`, Task 8, via `apiServer` directly for the server page);
  `VERIFICATION_CHECKLIST_COMPONENTS`, `VerificationChecklistComponent`
  (`@campushomes/shared`, unchanged).
- Produces: nothing consumed by later tasks (leaf page).

- [ ] **Step 1: Create the server page**

Create `apps/web/src/app/(ops)/ops/inspect/[visitId]/page.tsx`. Looks up the
visit from the same `/ops/visits/mine` list used by the home screen (only
pre-approval visits appear there, which is exactly the set Inspection Mode
should be reachable for):

```tsx
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import type { OpsVisitMine } from "@campushomes/shared";

import { apiServer } from "@/lib/server-api";
import { InspectionForm } from "./inspection-form";

export const metadata: Metadata = { title: "Inspection" };

export default async function InspectVisitPage({
  params,
}: {
  params: Promise<{ visitId: string }>;
}) {
  const { visitId } = await params;
  const visits = (await apiServer<OpsVisitMine[]>("/ops/visits/mine")) ?? [];
  const visit = visits.find((v) => v.visit_id === visitId);
  if (!visit) {
    notFound();
  }

  return (
    <>
      <h1 className="text-2xl">{visit.property_name}</h1>
      <p className="text-sm text-muted-foreground">{visit.street_address}</p>
      <div className="mt-6">
        <InspectionForm visitId={visitId} />
      </div>
    </>
  );
}
```

- [ ] **Step 2: Create the checklist form**

Create `apps/web/src/app/(ops)/ops/inspect/[visitId]/inspection-form.tsx`:

```tsx
"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  VERIFICATION_CHECKLIST_COMPONENTS,
  type VerificationChecklistComponent,
} from "@campushomes/shared";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { StatusChip } from "@/components/status-chip";
import { getDraft, putDraft, type InspectionDraft } from "@/lib/ops/inspection-db";
import { syncQueuedDrafts } from "@/lib/ops/sync-manager";

const COMPONENT_LABEL: Record<VerificationChecklistComponent, string> = {
  location_gps: "Location & GPS",
  rooms_capacity: "Rooms & capacity",
  amenities: "Amenities",
  photos: "Photos match property",
  landlord_identity: "Landlord identity",
  safety: "Safety",
};

function emptyChecklist(): InspectionDraft["checklist"] {
  return Object.fromEntries(
    VERIFICATION_CHECKLIST_COMPONENTS.map((c) => [c, { passed: null, notes: "" }]),
  ) as InspectionDraft["checklist"];
}

function newDraft(visitId: string): InspectionDraft {
  return {
    visitId,
    clientIdempotencyKey: crypto.randomUUID(),
    checklist: emptyChecklist(),
    visitGpsLat: null,
    visitGpsLon: null,
    startedAt: new Date().toISOString(),
    completedAt: null,
    result: null,
    failureReason: "",
    syncStatus: "draft",
  };
}

const numberFieldClass =
  "flex h-11 w-full rounded-md border border-input bg-background px-3 text-base text-foreground shadow-xs sm:h-10";

export function InspectionForm({ visitId }: { visitId: string }) {
  const [draft, setDraft] = useState<InspectionDraft | null>(null);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    let cancelled = false;
    getDraft(visitId).then(async (existing) => {
      if (cancelled) return;
      if (existing) {
        setDraft(existing);
        return;
      }
      const created = newDraft(visitId);
      await putDraft(created);
      if (!cancelled) setDraft(created);
      if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(
          (pos) => {
            if (cancelled) return;
            setDraft((prev) =>
              prev
                ? { ...prev, visitGpsLat: pos.coords.latitude, visitGpsLon: pos.coords.longitude }
                : prev,
            );
          },
          () => {
            // Permission denied or unavailable — the manual fields below cover it.
          },
        );
      }
    });
    return () => {
      cancelled = true;
    };
  }, [visitId]);

  const persist = useCallback((next: InspectionDraft) => {
    setDraft(next);
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      void putDraft(next);
    }, 300);
  }, []);

  if (!draft) {
    return <p className="text-sm text-muted-foreground">Loading…</p>;
  }

  if (draft.syncStatus === "synced") {
    return (
      <Card>
        <CardContent className="p-5">
          <StatusChip tone="success">Synced</StatusChip>
          <p className="mt-2 text-sm text-muted-foreground">
            This checklist has already been submitted and is waiting on lead approval.
          </p>
        </CardContent>
      </Card>
    );
  }

  function setComponent(
    component: VerificationChecklistComponent,
    patch: Partial<{ passed: boolean; notes: string }>,
  ) {
    persist({
      ...draft,
      checklist: {
        ...draft.checklist,
        [component]: { ...draft.checklist[component], ...patch },
      },
    });
  }

  const allAnswered = VERIFICATION_CHECKLIST_COMPONENTS.every(
    (c) => draft.checklist[c].passed !== null,
  );
  const canSubmit = allAnswered && draft.result !== null && draft.visitGpsLat !== null;

  async function submit() {
    const completed: InspectionDraft = {
      ...draft,
      completedAt: new Date().toISOString(),
      syncStatus: "queued",
    };
    await putDraft(completed);
    setDraft(completed);
    void syncQueuedDrafts();
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label htmlFor="gps-lat">GPS latitude</Label>
          <input
            id="gps-lat"
            type="number"
            step="any"
            value={draft.visitGpsLat ?? ""}
            onChange={(e) =>
              persist({
                ...draft,
                visitGpsLat: e.target.value === "" ? null : Number(e.target.value),
              })
            }
            className={numberFieldClass}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="gps-lon">GPS longitude</Label>
          <input
            id="gps-lon"
            type="number"
            step="any"
            value={draft.visitGpsLon ?? ""}
            onChange={(e) =>
              persist({
                ...draft,
                visitGpsLon: e.target.value === "" ? null : Number(e.target.value),
              })
            }
            className={numberFieldClass}
          />
        </div>
      </div>

      {VERIFICATION_CHECKLIST_COMPONENTS.map((component) => {
        const entry = draft.checklist[component];
        return (
          <Card key={component}>
            <CardContent className="space-y-3 p-5">
              <div className="flex items-center justify-between gap-3">
                <p className="font-semibold text-foreground">{COMPONENT_LABEL[component]}</p>
                <div className="flex gap-2">
                  <Button
                    type="button"
                    size="sm"
                    variant={entry.passed === true ? "primary" : "secondary"}
                    onClick={() => setComponent(component, { passed: true })}
                  >
                    Pass
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant={entry.passed === false ? "destructive" : "secondary"}
                    onClick={() => setComponent(component, { passed: false })}
                  >
                    Fail
                  </Button>
                </div>
              </div>
              <Textarea
                placeholder="Notes (optional)"
                value={entry.notes}
                onChange={(e) => setComponent(component, { notes: e.target.value })}
              />
            </CardContent>
          </Card>
        );
      })}

      <Card>
        <CardContent className="space-y-3 p-5">
          <p className="font-semibold text-foreground">Overall result</p>
          <div className="flex gap-2">
            <Button
              type="button"
              variant={draft.result === "passed" ? "primary" : "secondary"}
              onClick={() => persist({ ...draft, result: "passed" })}
            >
              Passed
            </Button>
            <Button
              type="button"
              variant={draft.result === "failed" ? "destructive" : "secondary"}
              onClick={() => persist({ ...draft, result: "failed" })}
            >
              Failed
            </Button>
          </div>
          {draft.result === "failed" && (
            <Textarea
              placeholder="Failure reason"
              value={draft.failureReason}
              onChange={(e) => persist({ ...draft, failureReason: e.target.value })}
            />
          )}
        </CardContent>
      </Card>

      <Button type="button" disabled={!canSubmit} onClick={submit} className="w-full">
        Submit checklist
      </Button>
      {draft.syncStatus === "queued" && (
        <p role="status" className="text-sm text-warning">
          Saved on this device — will sync automatically when back online.
        </p>
      )}
    </div>
  );
}
```

- [ ] **Step 3: Typecheck and lint**

Run: `pnpm --filter @campushomes/web typecheck && pnpm --filter @campushomes/web lint`
Expected: both clean.

- [ ] **Step 4: Commit**

```bash
git add "apps/web/src/app/(ops)/ops/inspect/[visitId]"
git commit -m "Add offline-capable Inspection Mode checklist page"
```

---

### Task 16: Manual QA + full verification gate

**Files:** none (verification only).

**Interfaces:** none.

- [ ] **Step 1: Start the stack**

Run:
```bash
docker compose -f apps/api/docker-compose.test.yml up -d --wait
pnpm --filter @campushomes/api dev &
pnpm --filter @campushomes/web dev &
```

- [ ] **Step 2: Seed one ops_lead, one ops_inspector, and a pending property**

Promote a test user's role via the docker DB directly (same technique used
in Phase 3/4 QA — see `CLAUDE.md`'s notes on promoting roles locally), or
insert fresh rows:
```sql
INSERT INTO ops_staff (user_id, team) VALUES ('<some-user-id>', 'inspector');
```
Use an existing pending property from earlier QA data, or create one via
the landlord onboarding flow.

- [ ] **Step 3: Lead flow — schedule, review, approve, publish**

1. Sign in as ops_lead. Confirm the queue shows the pending property with
   an SLA age badge.
2. Click "Schedule", pick the inspector, submit. Confirm redirect to `/ops`
   and the row now shows "View".

- [ ] **Step 4: Inspector flow — offline checklist capture**

1. Sign in as ops_inspector (separate browser/incognito). Confirm
   `/ops/inspect` shows the scheduled visit.
2. Open it, confirm GPS auto-populates (allow the permission prompt).
3. In devtools, set Network to "Offline". Fill all 6 components + overall
   result, submit. Confirm the "Saved on this device — will sync
   automatically" message appears and the my-visits list shows "Queued".
4. Reload the page. Confirm the draft survived (still shows the same
   answers, not reset).
5. Set Network back to "Online". Within 30s (or trigger the `online` event
   by toggling network off/on again), confirm the status flips to
   "Synced".

- [ ] **Step 5: Lead flow — approve and publish**

1. Back in the lead browser, open the visit detail page. Confirm the
   6-component checklist renders with the inspector's pass/fail + notes.
2. Click "Approve". Confirm the "Publish" link appears.
3. Click through, fill price + at least one amenity + one unit label,
   submit. Confirm redirect to `/ops` and — via the docker DB directly —
   confirm the `listings.status` flipped to `verified` and a `units` row
   was created.

- [ ] **Step 6: Full verification gate**

Run: `pnpm lint && pnpm typecheck && pnpm test`
Expected: all green, per `CLAUDE.md`'s "Verification loop."

- [ ] **Step 7: Commit any QA-driven fixes**

If Step 3–5 surfaced a bug, fix it, add/adjust a test that reproduces it,
and commit with a message describing what broke and why — same standard
as Phases 3 and 4's QA passes.
