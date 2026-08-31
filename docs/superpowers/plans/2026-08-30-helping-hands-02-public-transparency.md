# Helping Hands — Plan 2: Cases, Disbursements & Public Transparency

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Admins can record the people/situations helped (cases) and the money paid out against them (disbursements), publish an anonymised summary of each, and the public sees a live transparency page — total raised, total given, people helped, and recent causes — without any private detail ever leaking.

**Architecture:** Builds on Plan 1. The `Case` and `Disbursement` tables already exist (created in Plan 1 Task 4). This plan adds: a cases/disbursements data layer with an audited, transactional write path; a **public** data layer whose reads structurally cannot return private fields; the admin screens to manage cases; and the public pages. Same stack, same patterns.

**Tech Stack:** Next.js 16 (App Router), React 19, Prisma 7 + `@prisma/adapter-pg`, Zod 4, Tailwind v4, Vitest. Auth.js v5.

**Spec:** `docs/superpowers/specs/2026-08-28-helping-hands-design.md` (§4 data model, §7 authorization + the public anonymisation rule, §8 screens).

## Global Constraints

Every task's requirements implicitly include this section.

- **Money is integer paise.** No floating-point arithmetic on money. Amounts parsed via `parseRupeesToPaise` from `@/lib/money`; displayed via `Money` / `formatPaise`.
- **Dates are date-only** (`@db.Date`); normalise with `toDateOnly`; "today" defaults come from `todayInIndia()`, never `toISOString()`. FY 1 Apr–31 Mar via `@/lib/fy`.
- **The public anonymisation rule (spec §7) is the heart of this plan.** The public surface must NEVER expose `beneficiaryName`, `beneficiaryContact`, `privateNotes`, any unpublished case, contributor identities, or private attachments. A published case shows only: `category`, `publicSummary`, `city`/`state`, month + year of `occurredOn`, and its total disbursed. Public reads must select these fields explicitly — never `findMany()` over the whole row and trust the caller to omit.
- **Every server action independently re-checks the caller's role** with `requireAdmin` from `@/lib/authz`, before any read of input or any write.
- **Money records are never hard-deleted.** (Cases can be unpublished; disbursements, once this plan ships, are append-only in the UI — no delete action.)
- **Balance is private by default.** The public "in hand" figure appears only when `OrgSettings.showBalancePublicly` is true.
- Roles are exactly `MEMBER` and `ADMIN`.
- **Mobile-first is functional:** designed at 360px; tables→cards below `sm`; tap targets ≥44px; use the existing primitives (`Button`, `Field`/`inputClass`, `AmountInput`, `Money`, `RecordList`) and the warm design system (forest/marigold/paper tokens, `font-display`, `.lift`, `.mark`, `.aura`).
- Test output must be **pristine**. TDD required for the data layer and every server action.
- Tests run against `helping_hands_test` behind the two guards — never disable them. `vitest.config.mts`'s `server.deps.inline` for `next-auth` is load-bearing.
- Never modify or print `.env` / `.env.test`.

## File Structure

| Path | Responsibility |
|---|---|
| `src/lib/data/cases.ts` | Admin case reads/writes; disbursement writes; audited + transactional |
| `src/lib/data/public.ts` | The ONLY module public pages read from — anonymised by construction |
| `src/app/admin/cases/page.tsx` | Admin: list cases, create |
| `src/app/admin/cases/actions.ts` | Server actions: save case, publish/unpublish, add disbursement |
| `src/app/admin/cases/CaseForm.tsx` | Client form for create/edit |
| `src/app/admin/cases/[id]/page.tsx` | Admin: edit case, manage disbursements, publish toggle |
| `src/app/admin/cases/[id]/DisbursementForm.tsx` | Client form to add a disbursement |
| `src/app/(public)/page.tsx` or `src/app/page.tsx` | Public transparency homepage (enriched) |
| `src/app/cases/[id]/page.tsx` | Public anonymised case detail |
| `src/components/CaseCard.tsx` | Public anonymised cause card |
| `src/lib/categories.ts` | Single source of `CaseCategory` labels/order (avoid 4-place duplication) |
| `tests/data/cases.test.ts`, `tests/data/public.test.ts`, `tests/actions/cases.test.ts` | Tests |

---

### Task 1: Category labels, cases + disbursements data layer, public data layer

**Files:**
- Create: `src/lib/categories.ts`, `src/lib/data/cases.ts`, `src/lib/data/public.ts`
- Test: `tests/data/cases.test.ts`, `tests/data/public.test.ts`

**Interfaces produced:**
- `src/lib/categories.ts`: `CASE_CATEGORIES: { value: CaseCategory; label: string }[]` (MEDICAL→"Medical", EDUCATION→"Education", FOOD→"Food & essentials", SHELTER→"Shelter", DISASTER→"Disaster relief", OTHER→"Other"); `categoryLabel(c: CaseCategory): string`.
- `src/lib/data/cases.ts`:
  - `caseSchema` (Zod): `title` (trim, min 1), `category` (enum), `publicSummary` (trim, min 1), `beneficiaryName`/`beneficiaryContact`/`privateNotes`/`city`/`state` (optional nullable), `occurredOn` (date).
  - `createCase(input, actorId): Promise<Case>` — audited CREATE.
  - `updateCase(id, input, actorId): Promise<Case>` — non-destructive partial update (build payload from present keys, like `updateContributor`), audited UPDATE.
  - `setCasePublished(id, published, actorId): Promise<void>` — audited PUBLISH/UNPUBLISH.
  - `listCases(): Promise<(Case & { disbursedPaise: bigint })[]>` — admin list, newest first, with per-case disbursed total.
  - `getCase(id)` — admin single (full row incl. private fields + disbursements).
  - `disbursementSchema`: `amountPaise` (int positive), `paidOn` (date), `mode` (PaymentMode enum), `paidTo`/`reference`/`note` (optional nullable).
  - `createDisbursement(caseId, input, actorId): Promise<Disbursement>` — inside `$transaction`, audited CREATE with `tx`.
  - `caseDisbursedTotal(caseId): Promise<bigint>`.
- `src/lib/data/public.ts`:
  - `type PublicImpact = { raisedPaise: bigint; disbursedPaise: bigint; balancePaise: bigint | null; peopleHelped: number }`.
  - `publicImpact(): Promise<PublicImpact>` — raised = ACTIVE contributions sum; disbursed = all disbursements sum; peopleHelped = count of published cases; balancePaise = raised−disbursed ONLY if `OrgSettings.showBalancePublicly`, else `null`.
  - `type PublicCase = { id: string; category: CaseCategory; publicSummary: string; city: string | null; state: string | null; occurredOn: Date; disbursedPaise: bigint }` — NOTE: no name/contact/notes/status fields at all.
  - `listPublishedCases(limit?: number): Promise<PublicCase[]>` — only `isPublished`, newest by `occurredOn`, selecting ONLY the public fields.
  - `getPublishedCase(id): Promise<PublicCase | null>` — returns null if not found OR not published.

- [ ] **Step 1: Write `src/lib/categories.ts`** (no test needed — trivial constant), then the failing tests for cases + public.

Create `tests/data/public.test.ts` with the anonymisation guarantees as the centrepiece:

```ts
import { describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { createCase, createDisbursement, setCasePublished } from "@/lib/data/cases";
import { getPublishedCase, listPublishedCases, publicImpact } from "@/lib/data/public";

async function aCase(overrides: Record<string, unknown> = {}) {
  return createCase(
    {
      title: "Hospital bill for a daily-wage worker",
      category: "MEDICAL",
      publicSummary: "Medical support for a family after an accident.",
      beneficiaryName: "REAL NAME MUST NOT LEAK",
      beneficiaryContact: "+91 99999 00000",
      privateNotes: "PRIVATE NOTE MUST NOT LEAK",
      city: "Hyderabad",
      state: "Telangana",
      occurredOn: new Date(Date.UTC(2026, 5, 10)),
      ...overrides,
    },
    null,
  );
}

describe("listPublishedCases", () => {
  it("excludes unpublished cases", async () => {
    await aCase(); // unpublished
    expect(await listPublishedCases()).toEqual([]);
  });

  it("returns published cases with ONLY anonymised fields", async () => {
    const c = await aCase();
    await setCasePublished(c.id, true, null);

    const list = await listPublishedCases();
    expect(list).toHaveLength(1);
    const pc = list[0];

    // The public shape carries these:
    expect(pc.category).toBe("MEDICAL");
    expect(pc.publicSummary).toContain("Medical support");
    expect(pc.city).toBe("Hyderabad");

    // And CANNOT carry any of these — the whole point of the plan:
    const serialised = JSON.stringify(pc);
    expect(serialised).not.toContain("REAL NAME");
    expect(serialised).not.toContain("99999");
    expect(serialised).not.toContain("PRIVATE NOTE");
    expect(pc).not.toHaveProperty("beneficiaryName");
    expect(pc).not.toHaveProperty("beneficiaryContact");
    expect(pc).not.toHaveProperty("privateNotes");
  });

  it("includes each case's disbursed total", async () => {
    const c = await aCase();
    await setCasePublished(c.id, true, null);
    await createDisbursement(
      c.id,
      { amountPaise: 1500000, paidOn: new Date(Date.UTC(2026, 5, 12)), mode: "BANK" },
      null,
    );
    const pc = (await listPublishedCases())[0];
    expect(pc.disbursedPaise).toBe(1500000n);
  });
});

describe("getPublishedCase", () => {
  it("returns null for an unpublished case even by direct id", async () => {
    const c = await aCase();
    expect(await getPublishedCase(c.id)).toBeNull();
  });

  it("returns anonymised detail for a published case", async () => {
    const c = await aCase();
    await setCasePublished(c.id, true, null);
    const pc = await getPublishedCase(c.id);
    expect(pc).not.toBeNull();
    expect(JSON.stringify(pc)).not.toContain("REAL NAME");
  });
});

describe("publicImpact", () => {
  it("counts only published cases as people helped, and hides balance by default", async () => {
    const c1 = await aCase();
    await setCasePublished(c1.id, true, null);
    await aCase(); // unpublished — must not count

    const impact = await publicImpact();
    expect(impact.peopleHelped).toBe(1);
    expect(impact.balancePaise).toBeNull(); // showBalancePublicly defaults false
  });

  it("exposes balance only when showBalancePublicly is true", async () => {
    await prisma.orgSettings.update({
      where: { id: "singleton" },
      data: { showBalancePublicly: true },
    });
    const impact = await publicImpact();
    expect(impact.balancePaise).not.toBeNull();
  });
});
```

Create `tests/data/cases.test.ts` covering: `createCase` writes + audits; `updateCase` is non-destructive (omitting `privateNotes` leaves an existing value intact); `setCasePublished` flips the flag + audits PUBLISH/UNPUBLISH; `createDisbursement` stores paise inside a transaction with an audit row and rolls back on failure; `listCases` returns the per-case disbursed total. Follow the shapes of `tests/data/contributions.test.ts` and `tests/data/contributors.test.ts`.

- [ ] **Step 2:** Run `npm test -- data/public data/cases` → expect FAIL (modules missing).
- [ ] **Step 3:** Implement `categories.ts`, `cases.ts`, `public.ts`. In `public.ts`, every Prisma read uses an explicit `select` of only the public fields — never `include`/`findMany` of the whole row. `publicImpact` reuses the same aggregation approach as `ledgerTotals` (BigInt at the aggregate step).
- [ ] **Step 4:** Run the full suite → all green, pristine.
- [ ] **Step 5:** Commit: `feat: add cases, disbursements, and anonymised public data layer`.

---

### Task 2: Admin cases screens

**Files:**
- Create: `src/app/admin/cases/page.tsx`, `src/app/admin/cases/actions.ts`, `src/app/admin/cases/CaseForm.tsx`, `src/app/admin/cases/[id]/page.tsx`, `src/app/admin/cases/[id]/DisbursementForm.tsx`
- Modify: `src/components/AdminShell.tsx` (add a "Causes" tab, both desktop + mobile nav)
- Test: `tests/actions/cases.test.ts`

**Interfaces consumed:** everything from `src/lib/data/cases.ts`, `categoryLabel`/`CASE_CATEGORIES`, `requireAdmin`, `parseRupeesToPaise`, `toDateOnly`, `todayInIndia`.

**Interfaces produced:** server actions `saveCaseAction(prev, formData)`, `setPublishedAction(formData)`, `addDisbursementAction(prev, formData)` — each `requireAdmin` first; `ActionState = { error?: string; ok?: boolean }`.

Requirements:
- `/admin/cases`: heading in the house style; a create form (title, category `<select>` from `CASE_CATEGORIES`, publicSummary `<textarea>`, occurredOn defaulting to `todayInIndia()`, and a collapsed `<details>` for the private fields — beneficiary name/contact, city/state, private notes); a `RecordList` of existing cases showing title, category label, city, disbursed total (`Money`), and a Published/Draft pill linking to the detail page.
- `/admin/cases/[id]`: edit form (prefilled, non-destructive update), a **publish/unpublish** control (a two-tap confirm like `VoidButton` is NOT required — a plain guarded button is fine, but the button label must reflect current state and the action re-checks admin), the list of disbursements for the case with a running total, and `DisbursementForm` (amount via `AmountInput`, paidOn default today, mode `<select>`, optional paidTo/reference/note).
- The date server-side must use the same round-trip validation as contributions (reject `2026-13-40`).
- Amount uses `parseRupeesToPaise` with the ₹2.14 crore ceiling message.
- Add "Causes" to the admin nav (an icon path is fine; keep the 44/56px targets).
- Tests (TDD): `saveCaseAction` creates for an admin and refuses a non-admin (writes nothing); `addDisbursementAction` converts rupees→paise and refuses a non-admin; `setPublishedAction` flips only for an admin. Seed a real `User` row in `beforeEach` for the audit FK (as Plan 1 Tasks 12–13 did).

Steps: write failing action tests → run (FAIL) → implement actions → implement pages/forms → add nav tab → full suite green + `npm run build` clean → verify `/admin/cases` signed out returns 307 via curl → commit `feat: add admin cases and disbursements management`.

---

### Task 3: Public transparency homepage and case detail

**Files:**
- Modify: `src/app/page.tsx` (enrich into the transparency homepage)
- Create: `src/app/cases/[id]/page.tsx`, `src/components/CaseCard.tsx`
- Test: none required beyond a build check (presentational); the anonymisation guarantee is already covered by Task 1's tests, which these pages inherit by consuming ONLY `src/lib/data/public.ts`.

Requirements:
- The homepage keeps the warm identity (aura, Fraunces, forest/marigold, `.mark`, `.lift`) and adds, below the hero, a **live impact band**: three (or four, if balance is public) big figures from `publicImpact()` — "Raised", "Given out", "People helped", and "In hand" only when `balancePaise !== null`. Use `Money … compact` and `font-display`; label each plainly. If everything is zero (no data yet), show an honest, warm empty state ("The ledger is just getting started") rather than a wall of ₹0.
- A **"Where it went" section**: a responsive grid of `CaseCard`s from `listPublishedCases(6)`. Each card shows the category label (as an eyebrow/pill), the `publicSummary`, city + "Month Year" of `occurredOn`, and the amount given (`Money`). Link to `/cases/[id]`. If there are no published cases, a warm empty state.
- Keep the existing "how it works"/promise content, or fold it into the new structure — the page must read as a real charity homepage: hero → impact → causes → how-it-works/promise → footer. **This is the page a first-time visitor judges the group by; give it the care the frontend-design skill calls for.** No fabricated numbers, no stock beneficiary photos (the project is deliberately anonymised — lean on type, space, and honesty).
- `/cases/[id]`: fetch via `getPublishedCase(id)`; if null, `notFound()`. Show category, publicSummary, city/state, month+year, amount given, and a link back home. Anonymised only.
- Public pages must NOT require auth (no admin guard, no session needed) and must read exclusively from `src/lib/data/public.ts`.
- Format the month/year with `Intl.DateTimeFormat("en-IN", { month: "long", year: "numeric", timeZone: "UTC" })` on the date-only value (it's stored UTC-midnight).

Steps: implement `CaseCard` → enrich homepage → build case detail → `npm run build` + `tsc` + `lint` clean, full suite still green → curl `/` (200) and confirm no private strings ever appear in the public HTML for a published case with private fields set (manual check with a seeded published case) → commit `feat: add public transparency homepage and case detail`.

---

## What Plan 2 delivers

A visitor lands on a real charity homepage: what the group does, live totals of money raised and given, how many people were helped, and anonymised cards of recent causes — each clickable for a little more. Admins get the screens to record cases, pay out disbursements, and publish a summary, with the private details of the people they help never crossing to the public side. The anonymisation rule is enforced in the data layer by construction and pinned by tests, not left to each page to remember.

## Deferred to Plan 3

PDF receipts + the 80G switch, `/admin/settings` (org details, the `showBalancePublicly` and `aboutText` toggles — until then those are edited directly or left at defaults), `/admin/users`, Excel export, public/private attachments on cases, and the Playwright end-to-end suite.
