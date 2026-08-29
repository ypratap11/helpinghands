# Helping Hands — Design Spec

- **Date:** 2026-08-28
- **Status:** Draft for review
- **Scope:** v1 of a contribution-and-help tracking site for a small informal charity group in India

## 1. Purpose

A small group of friends pools money and helps people in need. One or two admins
collect the money and disburse it. Today the entire record lives in a WhatsApp
group — there is no spreadsheet and no history to migrate.

This system replaces that with a durable record that answers three questions:

1. **Admins:** who gave what, and where did it go?
2. **Contributors:** what have I given, and can I have an acknowledgement?
3. **Public:** is this group trustworthy — how much was raised, and how was it spent?

It is built so that when the group registers as a trust/society and receives 80G
approval, tax-deductible receipts can be switched on without re-entering data or
changing code.

## 2. Users and roles

| Role | Who | Can do |
|---|---|---|
| Public (no login) | Anyone | See totals and anonymised published cases |
| `MEMBER` | A friend who has contributed | See only their own contributions and download acknowledgements |
| `ADMIN` | The 1–2 people who collect and disburse | Everything: record contributions, manage cases and disbursements, settings, exports |

Login is Google sign-in only, via Auth.js v5 (self-hosted, no per-user cost, no
SMS charges). Anyone may sign in; they receive `MEMBER` by default. Admins are
bootstrapped from the `ADMIN_EMAILS` environment variable on first sign-in and
can promote others from `/admin/users`.

## 3. Scope

**In scope for v1**

- Admin ledger of contributions received and money disbursed
- Cases (people/situations helped), with private beneficiary details and a public anonymised summary
- Public transparency page with running totals and published cases
- Member portal showing only that member's own contributions
- PDF acknowledgement per contribution and per financial year
- File attachments (bills, photos) with private-by-default access control
- Audit log of all changes to money records
- One-click export of all data to Excel
- 80G-ready data capture, switchable on later

**Explicitly out of scope for v1**

- Online payments / payment gateway (money continues to move outside the system)
- CSV/Excel import — there is no existing spreadsheet to migrate
- Email or WhatsApp sending
- Campaigns/drives grouping
- Recurring donations, multi-currency
- Form 10BD export (v2 — but its required fields are captured from day one)

## 4. Architecture

A single Next.js (App Router, TypeScript) application serving the public page,
member portal and admin area, backed by PostgreSQL through Prisma.

```
+------------ Docker Compose ------------+
|  caddy   ->  app (Next.js standalone)  |
|                |                       |
|                v                       |
|              db (postgres:16, volume)  |
+----------------------------------------+
```

- **caddy** — reverse proxy, automatic free HTTPS once a domain points at the droplet
- **app** — Next.js in standalone output mode
- **db** — PostgreSQL 16 with a named volume for durability

Local development runs `docker compose up db` plus `npm run dev`, so the database
is identical to production. On the DigitalOcean droplet the same compose file
runs all three services. A $6/month basic droplet is sufficient for this scale.

File storage goes through a `storage` module with two drivers: `local`
(a bind-mounted directory) for now, `spaces` (DigitalOcean Spaces, S3-compatible)
later. Switching is configuration, not code.

## 5. Data model

### Design decision: `Contributor` is not `User`

A **Contributor** is anyone who gave money, including people who will never log
in — an uncle who hands over cash, a colleague who sends UPI once. A **User** is
a Google login. They are linked by email the first time that person signs in.

Collapsing these into one table would make it impossible to record a cash
contribution from someone without an email address, which is a routine case here.

### Tables

**User** (plus Auth.js `Account`, `Session`, `VerificationToken`)
- `id`, `email` (unique), `name`, `image`
- `role` — `MEMBER` | `ADMIN`
- `createdAt`

**Contributor**
- `id`, `name`, `email` (nullable, indexed), `phone` (nullable)
- `pan`, `addressLine`, `city`, `state`, `pincode` — all nullable now, required later for 80G
- `userId` — nullable link to User, set on first matching sign-in
- `isSystem` — true for the seeded "Anonymous" contributor
- `notes` (admin only), `createdAt`

A single seeded contributor named **"Anonymous"** (`isSystem = true`) exists so
that unattributed cash can still be recorded against a real row rather than a
null.

**Contribution**
- `id`, `contributorId`
- `amountPaise` — **integer paise, never a floating-point rupee value**
- `receivedOn` — `DATE` (no time component)
- `mode` — `UPI` | `CASH` | `BANK` | `CHEQUE` | `OTHER`
- `reference` — UTR / transaction id / cheque number, nullable
- `note`, `receiptNo` (nullable, unique), `status` — `ACTIVE` | `VOID`
- `recordedByUserId`, `createdAt`, `updatedAt`

**Case** — a person or situation helped
- `id`, `title`
- `category` — `MEDICAL` | `EDUCATION` | `FOOD` | `SHELTER` | `DISASTER` | `OTHER`
- `beneficiaryName`, `beneficiaryContact`, `privateNotes` — **admin-only, never served publicly**
- `publicSummary` — the anonymised text shown to the world
- `city`, `state`, `occurredOn`
- `status` — `PROPOSED` | `APPROVED` | `DISBURSED` | `CLOSED`
- `isPublished` — gates all public visibility, default `false`
- `createdByUserId`, `createdAt`, `updatedAt`

**Disbursement** — money paid out against a case
- `id`, `caseId`, `amountPaise`, `paidOn` (`DATE`), `mode`, `paidTo`, `reference`, `note`
- `recordedByUserId`, `createdAt`

Cases are frequently paid in installments (a hospital bill in two parts, school
fees per term), so disbursements are a separate table rather than an amount
field on the case.

**Attachment**
- `id`, `entityType` (`CASE` | `DISBURSEMENT` | `CONTRIBUTION`), `entityId`
- `storageKey` (random, not user-supplied), `filename`, `mimeType`, `sizeBytes`
- `isPublic` — default `false`
- `uploadedByUserId`, `createdAt`

**OrgSettings** — a single row
- `orgName`, `addressLine`, `city`, `state`, `pincode`, `orgPan`, `logoKey`
- `registrationNumber`, `eightyGNumber`, `eightyGValidFrom`, `eightyGValidTo`
- `isEightyGEnabled` — default `false`
- `showBalancePublicly` — default `false`
- `receiptPrefix` — default `HH`
- `contactEmail`, `aboutText`

**ReceiptCounter**
- `financialYear` (e.g. `2026-27`, primary key), `lastSequence`

**AuditLog**
- `id`, `userId`, `action` (`CREATE` | `UPDATE` | `VOID` | `PUBLISH` | `UNPUBLISH`)
- `entityType`, `entityId`, `before` (JSON), `after` (JSON), `createdAt`

With two admins handling other people's donations, an audit trail is the
difference between resolving a disagreement and having an accusation.

### Money handling

All amounts are stored as **integer paise**. No floating-point arithmetic touches
money anywhere in the system. Postgres `INT` holds up to ₹2.14 crore per row,
which is ample per transaction; aggregate sums are read as `BigInt`. Display uses
`Intl.NumberFormat('en-IN')` with the ₹ symbol and Indian lakh/crore grouping.

### Dates and timezone

`receivedOn`, `paidOn` and `occurredOn` are stored as `DATE` with no time
component, so a contribution recorded late at night never shifts to the previous
or next day under timezone conversion. Financial year runs 1 April – 31 March;
all "this year" figures use that definition, and the application timezone is
`Asia/Kolkata`.

## 6. Receipts and the 80G switch

Every contribution can have a receipt number in the form
`{prefix}/{financialYear}/{sequence}` — for example `HH/2026-27/0042`.

- A number is allocated automatically when a contribution is created with status
  `ACTIVE`, using the financial year of its `receivedOn` date — not the date it
  was entered. Back-dated entries therefore land in the correct year's sequence.
- The sequence is allocated per financial year inside a database transaction
  against `ReceiptCounter`, so two admins recording contributions at the same
  moment cannot receive the same number.
- Once assigned, `receiptNo` is **immutable**.
- A contribution that has a receipt number is never hard-deleted. It is marked
  `VOID`, preserving an auditable, gap-free sequence — which is exactly what a
  tax authority expects to see.

**Today** (`isEightyGEnabled = false`) the PDF is titled *"Acknowledgement of
Contribution"* and makes no tax-deduction claim.

**After registration**, an admin fills in the 80G number and validity in settings
and flips `isEightyGEnabled`. The same PDF then renders as a tax-deductible
receipt carrying the organisation's PAN, registration number and 80G validity.
No code change, no redeploy, and no data re-entry — because PAN and address were
captured all along.

## 7. Authorization

- Middleware guards `/admin/*` (ADMIN only) and `/me` (any signed-in user).
- **Every server action independently re-checks the caller's role.** Middleware
  alone is a well-known source of authorization holes; it is a convenience layer,
  not the enforcement point.
- All "my own data" reads go through a single data-access module
  (`lib/data/contributions.ts`) where the `contributorId = current user` filter
  lives in exactly one place, rather than being retyped on every page.
- Attachments are served only through `/api/files/[id]`, which checks: public
  access requires `attachment.isPublic = true` **and** the parent case
  `isPublished = true`. Uploads never land in a publicly served directory.
- Accepted uploads: JPEG, PNG, WebP, PDF, max 10 MB.

### Public anonymisation rule

The public surface must never expose `beneficiaryName`, `beneficiaryContact`,
`privateNotes`, private attachments, contributor identities, or any unpublished
case. A published case shows only: category, `publicSummary`, city/state,
month and year, total disbursed, and attachments explicitly marked public.

## 8. Screens

**Public**
- `/` — what the group does, running totals (raised, disbursed, people helped,
  and balance only if `showBalancePublicly`), and a list of published cases
- `/cases/[id]` — anonymised case detail, 404 if not published

**Member**
- `/login` — Google sign-in
- `/me` — my contributions, per-financial-year totals, download acknowledgement
  per contribution or a consolidated one per year. A signed-in user with no
  matching contributions sees a clear "ask an admin to link your email" message
  rather than an empty table.

**Admin**
- `/admin` — dashboard: totals, balance, recent activity
- `/admin/contributions` — list, filter, add, edit, void
- `/admin/contributors` — list, add, edit, link to a user
- `/admin/cases` — list, add, edit, publish/unpublish; disbursements and
  attachments managed inside the case
- `/admin/export` — full Excel export
- `/admin/settings` — org details, 80G fields and switch, public display toggles
- `/admin/users` — promote/demote admins

## 9. Mobile-first requirements

Almost all use — including admin data entry — happens on a phone. This is a
functional requirement, not styling polish.

- Designed at 360 px width first; larger screens are the progressive enhancement.
- **Tables become cards below `sm`.** No horizontal scrolling to read a
  contribution row on a phone.
- Amount fields use `inputmode="numeric"` so the numeric keypad appears.
- Bill and photo uploads accept direct camera capture.
- Primary actions (Save, Add contribution) sit within thumb reach at the bottom
  of the viewport on small screens, not stranded at the top of a long form.
- Admin navigation is a bottom tab bar on mobile, a sidebar on desktop.
- Tap targets are at least 44×44 px.
- Forms are single-column on mobile, and never lose entered data on validation
  failure.
- Verified at 360 px, 390 px and 768 px widths.

## 10. Testing strategy

Built test-first. Vitest for the logic that must not be wrong:

- Money arithmetic and rupee/paise formatting
- Receipt number allocation, including concurrent allocation within one financial year
- Financial-year boundary handling (31 March vs 1 April)
- Permission checks on every server action
- The public anonymisation rule — private fields must never appear in a public payload

Playwright for the flows that matter end to end:

1. Admin records a contribution; it appears on that member's `/me` and nowhere else
2. An unpublished case is invisible on the public page and returns 404 by direct URL
3. A `MEMBER` cannot reach `/admin` or any admin server action
4. A private attachment is not retrievable without permission

## 11. Deployment and operations

- `docker-compose.yml` runs app + db + caddy; the same file works locally and on the droplet
- Secrets via `.env` (never committed); `.env.example` documents every variable:
  `DATABASE_URL`, `AUTH_SECRET`, `AUTH_GOOGLE_ID`, `AUTH_GOOGLE_SECRET`,
  `NEXTAUTH_URL`, `ADMIN_EMAILS`, `STORAGE_DRIVER`, `STORAGE_LOCAL_PATH`
- Schema changes ship as Prisma migrations, applied on container start
- **Nightly `pg_dump`** to a backups volume with 14-day retention, and a
  documented one-command restore. A charity ledger that cannot be restored is
  not a ledger.
- Uploaded files are included in the backup routine

## 12. Deferred decisions

These were consciously left open and implemented as settings so they can be
resolved later without code changes:

- **Showing cash-in-hand publicly** — `showBalancePublicly`, defaults to off
- **Unattributed contributions** — handled by the seeded "Anonymous" contributor

## 13. Future (v2)

Form 10BD export, campaigns/drives grouping, email receipts, and a public donor
wall — at which point a per-contribution "do not name me publicly" flag becomes
necessary, since v1 never displays contributor identities publicly at all.
Online payments if the group registers and wants them.
