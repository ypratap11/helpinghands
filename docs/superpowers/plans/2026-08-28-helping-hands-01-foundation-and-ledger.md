# Helping Hands — Plan 1: Foundation & Admin Ledger

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A running, deployable Next.js application where an admin signs in with Google and records who contributed money, with every rupee stored safely and every change audited.

**Architecture:** One Next.js App Router application backed by PostgreSQL through Prisma. Pure logic (money, financial years, receipt numbering) lives in `src/lib/*` as framework-free modules that are unit-tested directly. All database reads and writes go through a data-access layer in `src/lib/data/*`, so authorization filters live in one place instead of being retyped on every page. Postgres runs in Docker locally and on the droplet, so development and production share one database engine.

**Tech Stack:** Next.js 15 (App Router, TypeScript), React 19, Tailwind CSS v4, Prisma 6, PostgreSQL 16, Auth.js v5 (`next-auth@beta`) with the Prisma adapter and Google provider, Vitest for tests, Docker Compose.

**Spec:** `docs/superpowers/specs/2026-08-28-helping-hands-design.md`

## Global Constraints

Every task's requirements implicitly include this section.

- **Money is stored as integer paise.** No floating-point arithmetic touches money anywhere in the system. Never use `parseFloat` on a rupee value.
- **Dates without time.** `receivedOn`, `paidOn`, `occurredOn` are Prisma `@db.Date`. Never store a timestamp for these.
- **Financial year runs 1 April – 31 March.** Application timezone is `Asia/Kolkata`.
- **Mobile-first, designed at 360 px width.** Tables become cards below the `sm` breakpoint. Tap targets at least 44×44 px. Amount inputs use `inputmode="numeric"`. Verified at 360 px, 390 px and 768 px.
- **Every server action independently re-checks the caller's role.** Middleware is a convenience layer, never the enforcement point.
- **Money records are never hard-deleted.** A contribution with a receipt number is marked `VOID`.
- **Currency display** uses `Intl.NumberFormat('en-IN')` with the ₹ symbol and Indian lakh/crore grouping.
- **Secrets never committed.** Every environment variable is documented in `.env.example`.
- Roles are exactly `MEMBER` and `ADMIN`. Admins bootstrap from the `ADMIN_EMAILS` environment variable.

## File Structure

| Path | Responsibility |
|---|---|
| `docker-compose.yml` | Local Postgres (dev + test databases) |
| `prisma/schema.prisma` | Full data model for the whole product |
| `prisma/seed.ts` | Seeds the `Anonymous` contributor and the `OrgSettings` singleton |
| `src/lib/money.ts` | Rupee/paise conversion and `en-IN` formatting |
| `src/lib/fy.ts` | Indian financial-year boundaries and labels |
| `src/lib/db.ts` | Prisma client singleton |
| `src/lib/auth.ts` | Auth.js configuration, role bootstrap, contributor linking |
| `src/lib/authz.ts` | `requireUser` / `requireAdmin` guards |
| `src/lib/audit.ts` | Writes `AuditLog` rows |
| `src/lib/receipts.ts` | Atomic per-financial-year receipt number allocation |
| `src/lib/data/contributors.ts` | Contributor reads/writes |
| `src/lib/data/contributions.ts` | Contribution reads/writes, including the "my own data" filter |
| `src/components/ui/*` | Mobile-first primitives: Button, Input, Field, Select, Card, Money |
| `src/components/AdminShell.tsx` | Admin layout: bottom tabs on mobile, sidebar on desktop |
| `src/components/RecordList.tsx` | Responsive list — table on desktop, cards on mobile |
| `src/app/admin/**` | Admin pages and server actions |
| `tests/**` | Vitest unit and integration tests |

---

### Task 1: Project scaffold, tooling, and a running database

**Files:**
- Create: `docker-compose.yml`, `.env.example`, `.env`, `vitest.config.ts`, `src/lib/db.ts`
- Modify: `.gitignore`, `package.json`
- Test: `tests/smoke.test.ts`

**Interfaces:**
- Consumes: nothing (first task)
- Produces: `prisma` — the shared `PrismaClient` singleton exported from `src/lib/db.ts`; npm scripts `test`, `dev`, `db:up`

- [ ] **Step 1: Scaffold the Next.js app**

The repository already contains `docs/` and a `.gitignore`. `create-next-app` refuses to overwrite `.gitignore`, so remove it first — the generated one is a superset and we re-add our lines in Step 2.

```bash
rm .gitignore
npx create-next-app@latest . --typescript --tailwind --eslint --app --src-dir --import-alias "@/*" --use-npm
```

If a flag is rejected by the installed version, drop that flag and accept the interactive default matching it. Answer "No" to Turbopack if asked.

- [ ] **Step 2: Restore project ignore rules**

```bash
printf '\n# Helping Hands\n.env\n.env.test\nstorage/\nbackups/\n*.log\n' >> .gitignore
```

- [ ] **Step 3: Install dependencies**

```bash
npm install @prisma/client next-auth@beta @auth/prisma-adapter zod
npm install -D prisma vitest @vitejs/plugin-react vite-tsconfig-paths tsx
```

- [ ] **Step 4: Create the database service**

Create `docker-compose.yml`:

```yaml
services:
  db:
    image: postgres:16-alpine
    restart: unless-stopped
    environment:
      POSTGRES_USER: helping
      POSTGRES_PASSWORD: helping_local_dev
      POSTGRES_DB: helping_hands
    ports:
      - "5433:5432"
    volumes:
      - dbdata:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U helping -d helping_hands"]
      interval: 5s
      timeout: 5s
      retries: 10

volumes:
  dbdata:
```

Port 5433 is deliberate: it avoids colliding with any Postgres already installed on the host.

- [ ] **Step 5: Document and create environment files**

Create `.env.example`:

```
DATABASE_URL="postgresql://helping:helping_local_dev@localhost:5433/helping_hands?schema=public"
TEST_DATABASE_URL="postgresql://helping:helping_local_dev@localhost:5433/helping_hands_test?schema=public"
AUTH_SECRET=""
AUTH_GOOGLE_ID=""
AUTH_GOOGLE_SECRET=""
NEXTAUTH_URL="http://localhost:3000"
ADMIN_EMAILS=""
STORAGE_DRIVER="local"
STORAGE_LOCAL_PATH="./storage/uploads"
TZ="Asia/Kolkata"
```

Then `cp .env.example .env` and set `ADMIN_EMAILS` to your own Gmail address. Generate the secret:

```bash
npx auth secret
```

- [ ] **Step 6: Start the database and create the test database**

```bash
docker compose up -d db
docker compose exec db psql -U helping -d helping_hands -c "CREATE DATABASE helping_hands_test OWNER helping;"
```

Expected: `CREATE DATABASE`. If it reports the database already exists, that is fine.

- [ ] **Step 7: Create the Prisma client singleton**

Create `src/lib/db.ts`. Next.js dev-mode hot reload re-executes modules, and a fresh `PrismaClient` per reload exhausts the connection pool within minutes — hence the global cache.

```ts
import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma = globalForPrisma.prisma ?? new PrismaClient();

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;
```

- [ ] **Step 8: Configure Vitest**

Create `vitest.config.ts`:

```ts
import { defineConfig } from "vitest/config";
import tsconfigPaths from "vite-tsconfig-paths";

export default defineConfig({
  plugins: [tsconfigPaths()],
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
    globals: true,
  },
});
```

Add to `package.json` scripts:

```json
"test": "vitest run",
"test:watch": "vitest",
"db:up": "docker compose up -d db"
```

- [ ] **Step 9: Write a smoke test**

Create `tests/smoke.test.ts`:

```ts
import { describe, expect, it } from "vitest";

describe("toolchain", () => {
  it("runs tests", () => {
    expect(1 + 1).toBe(2);
  });
});
```

- [ ] **Step 10: Run the test suite**

Run: `npm test`
Expected: PASS, 1 test.

- [ ] **Step 11: Verify the app boots**

Run: `npm run dev`, open `http://localhost:3000`
Expected: the default Next.js page renders. Stop the server.

- [ ] **Step 12: Commit**

```bash
git add -A
git commit -m "chore: scaffold Next.js app, Postgres service, and Vitest"
```

---

### Task 2: Money module

**Files:**
- Create: `src/lib/money.ts`
- Test: `tests/lib/money.test.ts`

**Interfaces:**
- Consumes: nothing
- Produces:
  - `parseRupeesToPaise(input: string): number` — throws `InvalidAmountError` on bad input
  - `formatPaise(paise: number | bigint): string` — e.g. `"₹1,00,000.00"`
  - `formatPaiseCompact(paise: number | bigint): string` — no decimals when the amount is a whole rupee
  - `class InvalidAmountError extends Error`

- [ ] **Step 1: Write the failing tests**

Create `tests/lib/money.test.ts`. Note the lakh grouping expectations — `en-IN` groups as `1,00,000`, not `100,000`, and getting this wrong is the most likely silent bug in the module.

```ts
import { describe, expect, it } from "vitest";
import {
  InvalidAmountError,
  formatPaise,
  formatPaiseCompact,
  parseRupeesToPaise,
} from "@/lib/money";

describe("parseRupeesToPaise", () => {
  it("parses whole rupees", () => {
    expect(parseRupeesToPaise("500")).toBe(50000);
  });

  it("parses paise precisely", () => {
    expect(parseRupeesToPaise("1234.50")).toBe(123450);
  });

  it("parses a single decimal place as tens of paise", () => {
    expect(parseRupeesToPaise("10.5")).toBe(1050);
  });

  it("accepts Indian digit grouping and rupee symbol", () => {
    expect(parseRupeesToPaise("₹1,00,000")).toBe(10000000);
  });

  it("accepts surrounding whitespace", () => {
    expect(parseRupeesToPaise("  250  ")).toBe(25000);
  });

  it("does not lose precision on values that float maths rounds badly", () => {
    expect(parseRupeesToPaise("0.07")).toBe(7);
    expect(parseRupeesToPaise("1.15")).toBe(115);
    expect(parseRupeesToPaise("8.29")).toBe(829);
  });

  it("rejects more than two decimal places", () => {
    expect(() => parseRupeesToPaise("10.123")).toThrow(InvalidAmountError);
  });

  it("rejects negative amounts", () => {
    expect(() => parseRupeesToPaise("-5")).toThrow(InvalidAmountError);
  });

  it("rejects zero", () => {
    expect(() => parseRupeesToPaise("0")).toThrow(InvalidAmountError);
  });

  it("rejects empty and non-numeric input", () => {
    expect(() => parseRupeesToPaise("")).toThrow(InvalidAmountError);
    expect(() => parseRupeesToPaise("abc")).toThrow(InvalidAmountError);
  });
});

describe("formatPaise", () => {
  it("formats with two decimals and the rupee symbol", () => {
    expect(formatPaise(123450)).toBe("₹1,234.50");
  });

  it("groups in lakhs, not thousands", () => {
    expect(formatPaise(10000000)).toBe("₹1,00,000.00");
  });

  it("groups in crores", () => {
    expect(formatPaise(1000000000)).toBe("₹1,00,00,000.00");
  });

  it("accepts bigint aggregates from the database", () => {
    expect(formatPaise(50000n)).toBe("₹500.00");
  });

  it("formats zero", () => {
    expect(formatPaise(0)).toBe("₹0.00");
  });
});

describe("formatPaiseCompact", () => {
  it("drops decimals for whole rupees", () => {
    expect(formatPaiseCompact(50000)).toBe("₹500");
  });

  it("keeps decimals when paise are present", () => {
    expect(formatPaiseCompact(50050)).toBe("₹500.50");
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm test -- money`
Expected: FAIL — cannot resolve `@/lib/money`.

- [ ] **Step 3: Implement the module**

Create `src/lib/money.ts`. The parser works on the digit string rather than converting to a float, which is what keeps `0.07` exact.

```ts
export class InvalidAmountError extends Error {
  constructor(input: string) {
    super(`Not a valid rupee amount: ${JSON.stringify(input)}`);
    this.name = "InvalidAmountError";
  }
}

/**
 * Converts a human-typed rupee string into integer paise.
 * Deliberately string-based: parseFloat("0.07") * 100 is 7.000000000000001.
 */
export function parseRupeesToPaise(input: string): number {
  const cleaned = String(input).trim().replace(/[₹,\s]/g, "");

  if (!/^\d+(\.\d{1,2})?$/.test(cleaned)) throw new InvalidAmountError(input);

  const [whole, fraction = ""] = cleaned.split(".");
  const paise = Number(whole) * 100 + Number(fraction.padEnd(2, "0"));

  if (paise <= 0) throw new InvalidAmountError(input);
  if (!Number.isSafeInteger(paise)) throw new InvalidAmountError(input);

  return paise;
}

const formatter = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

export function formatPaise(paise: number | bigint): string {
  return formatter.format(Number(paise) / 100);
}

export function formatPaiseCompact(paise: number | bigint): string {
  const value = Number(paise);
  if (value % 100 !== 0) return formatPaise(value);

  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value / 100);
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm test -- money`
Expected: PASS, all tests.

If a formatting test fails on the exact character, print the received value — some ICU builds emit a narrow no-break space between `₹` and the digits. If that is the cause, normalise inside `formatPaise` with `.replace(/ | /g, "")` rather than weakening the test.

- [ ] **Step 5: Commit**

```bash
git add src/lib/money.ts tests/lib/money.test.ts
git commit -m "feat: add integer-paise money parsing and en-IN formatting"
```

---

### Task 3: Financial year module

**Files:**
- Create: `src/lib/fy.ts`
- Test: `tests/lib/fy.test.ts`

**Interfaces:**
- Consumes: nothing
- Produces:
  - `financialYearOf(date: Date | string): string` — returns e.g. `"2026-27"`
  - `financialYearRange(fy: string): { start: Date; end: Date }`
  - `currentFinancialYear(now?: Date): string`
  - `toDateOnly(input: Date | string): Date` — a UTC-midnight `Date` safe for a Postgres `DATE` column

- [ ] **Step 1: Write the failing tests**

Create `tests/lib/fy.test.ts`. The 31 March / 1 April boundary is the whole point of this module.

```ts
import { describe, expect, it } from "vitest";
import {
  currentFinancialYear,
  financialYearOf,
  financialYearRange,
  toDateOnly,
} from "@/lib/fy";

describe("financialYearOf", () => {
  it("puts 31 March in the year that is ending", () => {
    expect(financialYearOf("2026-03-31")).toBe("2025-26");
  });

  it("puts 1 April in the year that is starting", () => {
    expect(financialYearOf("2026-04-01")).toBe("2026-27");
  });

  it("handles mid-year dates", () => {
    expect(financialYearOf("2026-12-25")).toBe("2026-27");
  });

  it("handles January", () => {
    expect(financialYearOf("2027-01-15")).toBe("2026-27");
  });

  it("accepts a Date object", () => {
    expect(financialYearOf(new Date("2026-04-01T00:00:00Z"))).toBe("2026-27");
  });
});

describe("financialYearRange", () => {
  it("spans 1 April to 31 March", () => {
    const { start, end } = financialYearRange("2026-27");
    expect(start.toISOString().slice(0, 10)).toBe("2026-04-01");
    expect(end.toISOString().slice(0, 10)).toBe("2027-03-31");
  });

  it("round-trips with financialYearOf at both boundaries", () => {
    const { start, end } = financialYearRange("2026-27");
    expect(financialYearOf(start)).toBe("2026-27");
    expect(financialYearOf(end)).toBe("2026-27");
  });

  it("rejects a malformed label", () => {
    expect(() => financialYearRange("2026")).toThrow();
    expect(() => financialYearRange("2026-28")).toThrow();
  });
});

describe("currentFinancialYear", () => {
  it("uses the supplied clock", () => {
    expect(currentFinancialYear(new Date("2026-08-28T12:00:00Z"))).toBe("2026-27");
  });
});

describe("toDateOnly", () => {
  it("strips the time component", () => {
    expect(toDateOnly("2026-08-28").toISOString()).toBe("2026-08-28T00:00:00.000Z");
  });

  it("does not shift the day for a late-evening India timestamp", () => {
    // 28 Aug 23:30 IST is 18:00 UTC the same day; it must stay the 28th.
    expect(toDateOnly(new Date("2026-08-28T18:00:00Z")).toISOString().slice(0, 10)).toBe(
      "2026-08-28",
    );
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm test -- fy`
Expected: FAIL — cannot resolve `@/lib/fy`.

- [ ] **Step 3: Implement the module**

Create `src/lib/fy.ts`:

```ts
const FY_PATTERN = /^(\d{4})-(\d{2})$/;

/** Normalises any input to UTC midnight, matching a Postgres DATE column. */
export function toDateOnly(input: Date | string): Date {
  if (typeof input === "string") {
    const [y, m, d] = input.slice(0, 10).split("-").map(Number);
    return new Date(Date.UTC(y, m - 1, d));
  }
  return new Date(
    Date.UTC(input.getUTCFullYear(), input.getUTCMonth(), input.getUTCDate()),
  );
}

/** Indian financial year label for a date: 1 April – 31 March. */
export function financialYearOf(date: Date | string): string {
  const d = toDateOnly(date);
  const year = d.getUTCFullYear();
  const startYear = d.getUTCMonth() >= 3 ? year : year - 1;
  return `${startYear}-${String((startYear + 1) % 100).padStart(2, "0")}`;
}

export function financialYearRange(fy: string): { start: Date; end: Date } {
  const match = FY_PATTERN.exec(fy);
  if (!match) throw new Error(`Malformed financial year: ${fy}`);

  const startYear = Number(match[1]);
  const expectedEnd = String((startYear + 1) % 100).padStart(2, "0");
  if (match[2] !== expectedEnd) throw new Error(`Malformed financial year: ${fy}`);

  return {
    start: new Date(Date.UTC(startYear, 3, 1)),
    end: new Date(Date.UTC(startYear + 1, 2, 31)),
  };
}

export function currentFinancialYear(now: Date = new Date()): string {
  return financialYearOf(now);
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm test -- fy`
Expected: PASS, all tests.

- [ ] **Step 5: Commit**

```bash
git add src/lib/fy.ts tests/lib/fy.test.ts
git commit -m "feat: add Indian financial-year helpers"
```

---

### Task 4: Database schema, migration, and seed

**Files:**
- Create: `prisma/schema.prisma`, `prisma/seed.ts`
- Modify: `package.json`
- Test: `tests/db/schema.test.ts`

**Interfaces:**
- Consumes: `prisma` from `src/lib/db.ts`
- Produces: all Prisma model types — `User`, `Contributor`, `Contribution`, `Case`, `Disbursement`, `Attachment`, `OrgSettings`, `ReceiptCounter`, `AuditLog`; enums `Role`, `PaymentMode`, `ContributionStatus`, `CaseCategory`, `CaseStatus`, `AttachmentEntity`, `AuditAction`

The full model is written now, including tables used only in plans 2 and 3, so there is one migration baseline rather than a schema that churns.

- [ ] **Step 1: Write the schema**

Create `prisma/schema.prisma`:

```prisma
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

enum Role {
  MEMBER
  ADMIN
}

enum PaymentMode {
  UPI
  CASH
  BANK
  CHEQUE
  OTHER
}

enum ContributionStatus {
  ACTIVE
  VOID
}

enum CaseCategory {
  MEDICAL
  EDUCATION
  FOOD
  SHELTER
  DISASTER
  OTHER
}

enum CaseStatus {
  PROPOSED
  APPROVED
  DISBURSED
  CLOSED
}

enum AttachmentEntity {
  CASE
  DISBURSEMENT
  CONTRIBUTION
}

enum AuditAction {
  CREATE
  UPDATE
  VOID
  PUBLISH
  UNPUBLISH
}

model User {
  id            String    @id @default(cuid())
  name          String?
  email         String    @unique
  emailVerified DateTime?
  image         String?
  role          Role      @default(MEMBER)
  createdAt     DateTime  @default(now())

  accounts    Account[]
  sessions    Session[]
  contributor Contributor?
  auditLogs   AuditLog[]
}

model Account {
  id                String  @id @default(cuid())
  userId            String
  type              String
  provider          String
  providerAccountId String
  refresh_token     String? @db.Text
  access_token      String? @db.Text
  expires_at        Int?
  token_type        String?
  scope             String?
  id_token          String? @db.Text
  session_state     String?

  user User @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@unique([provider, providerAccountId])
}

model Session {
  id           String   @id @default(cuid())
  sessionToken String   @unique
  userId       String
  expires      DateTime
  user         User     @relation(fields: [userId], references: [id], onDelete: Cascade)
}

model VerificationToken {
  identifier String
  token      String   @unique
  expires    DateTime

  @@unique([identifier, token])
}

model Contributor {
  id          String   @id @default(cuid())
  name        String
  email       String?
  phone       String?
  pan         String?
  addressLine String?
  city        String?
  state       String?
  pincode     String?
  notes       String?
  isSystem    Boolean  @default(false)
  userId      String?  @unique
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt

  user          User?          @relation(fields: [userId], references: [id], onDelete: SetNull)
  contributions Contribution[]

  @@index([email])
  @@index([name])
}

model Contribution {
  id               String             @id @default(cuid())
  contributorId    String
  amountPaise      Int
  receivedOn       DateTime           @db.Date
  mode             PaymentMode
  reference        String?
  note             String?
  receiptNo        String?            @unique
  status           ContributionStatus @default(ACTIVE)
  recordedByUserId String?
  createdAt        DateTime           @default(now())
  updatedAt        DateTime           @updatedAt

  contributor Contributor @relation(fields: [contributorId], references: [id], onDelete: Restrict)

  @@index([receivedOn])
  @@index([contributorId, status])
}

model Case {
  id                 String       @id @default(cuid())
  title              String
  category           CaseCategory
  beneficiaryName    String?
  beneficiaryContact String?
  privateNotes       String?
  publicSummary      String
  city               String?
  state              String?
  occurredOn         DateTime     @db.Date
  status             CaseStatus   @default(PROPOSED)
  isPublished        Boolean      @default(false)
  createdByUserId    String?
  createdAt          DateTime     @default(now())
  updatedAt          DateTime     @updatedAt

  disbursements Disbursement[]

  @@index([isPublished, occurredOn])
}

model Disbursement {
  id               String      @id @default(cuid())
  caseId           String
  amountPaise      Int
  paidOn           DateTime    @db.Date
  mode             PaymentMode
  paidTo           String?
  reference        String?
  note             String?
  recordedByUserId String?
  createdAt        DateTime    @default(now())

  case Case @relation(fields: [caseId], references: [id], onDelete: Cascade)

  @@index([caseId])
  @@index([paidOn])
}

model Attachment {
  id               String           @id @default(cuid())
  entityType       AttachmentEntity
  entityId         String
  storageKey       String           @unique
  filename         String
  mimeType         String
  sizeBytes        Int
  isPublic         Boolean          @default(false)
  uploadedByUserId String?
  createdAt        DateTime         @default(now())

  @@index([entityType, entityId])
}

model OrgSettings {
  id                  String    @id @default("singleton")
  orgName             String    @default("Helping Hands")
  addressLine         String?
  city                String?
  state               String?
  pincode             String?
  orgPan              String?
  logoKey             String?
  registrationNumber  String?
  eightyGNumber       String?
  eightyGValidFrom    DateTime? @db.Date
  eightyGValidTo      DateTime? @db.Date
  isEightyGEnabled    Boolean   @default(false)
  showBalancePublicly Boolean   @default(false)
  receiptPrefix       String    @default("HH")
  contactEmail        String?
  aboutText           String?
  updatedAt           DateTime  @updatedAt
}

model ReceiptCounter {
  financialYear String @id
  lastSequence  Int    @default(0)
}

model AuditLog {
  id         String      @id @default(cuid())
  userId     String?
  action     AuditAction
  entityType String
  entityId   String
  before     Json?
  after      Json?
  createdAt  DateTime    @default(now())

  user User? @relation(fields: [userId], references: [id], onDelete: SetNull)

  @@index([entityType, entityId])
  @@index([createdAt])
}
```

`onDelete: Restrict` on `Contribution.contributor` is deliberate — a contributor who has given money cannot be deleted out from under their contributions.

- [ ] **Step 2: Create the migration**

```bash
npx prisma migrate dev --name init
```

Expected: a new folder under `prisma/migrations/` and "Your database is now in sync with your schema."

- [ ] **Step 3: Write the seed script**

Create `prisma/seed.ts`. Both rows use fixed IDs so the seed is idempotent.

```ts
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

export const ANONYMOUS_CONTRIBUTOR_ID = "anonymous";

async function main() {
  await prisma.orgSettings.upsert({
    where: { id: "singleton" },
    update: {},
    create: { id: "singleton" },
  });

  await prisma.contributor.upsert({
    where: { id: ANONYMOUS_CONTRIBUTOR_ID },
    update: {},
    create: {
      id: ANONYMOUS_CONTRIBUTOR_ID,
      name: "Anonymous",
      isSystem: true,
    },
  });
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (error) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });
```

Add to `package.json`:

```json
"prisma": { "seed": "tsx prisma/seed.ts" },
```

and to scripts:

```json
"db:seed": "tsx prisma/seed.ts",
"db:migrate": "prisma migrate dev",
"db:reset": "prisma migrate reset --force"
```

- [ ] **Step 4: Run the seed**

```bash
npm run db:seed
```

Expected: exits 0. Run it a second time — it must also exit 0, proving idempotence.

- [ ] **Step 5: Write a schema test**

Create `tests/db/schema.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";

describe("schema", () => {
  it("has the seeded settings singleton", async () => {
    const settings = await prisma.orgSettings.findUnique({ where: { id: "singleton" } });
    expect(settings?.isEightyGEnabled).toBe(false);
    expect(settings?.showBalancePublicly).toBe(false);
    expect(settings?.receiptPrefix).toBe("HH");
  });

  it("has the seeded anonymous contributor", async () => {
    const anon = await prisma.contributor.findUnique({ where: { id: "anonymous" } });
    expect(anon?.isSystem).toBe(true);
  });

  it("stores receivedOn without a time component", async () => {
    const contribution = await prisma.contribution.create({
      data: {
        contributorId: "anonymous",
        amountPaise: 50000,
        receivedOn: new Date(Date.UTC(2026, 7, 28)),
        mode: "CASH",
      },
    });
    expect(contribution.receivedOn.toISOString()).toBe("2026-08-28T00:00:00.000Z");
    await prisma.contribution.delete({ where: { id: contribution.id } });
  });
});
```

- [ ] **Step 6: Run the tests**

Run: `npm test -- schema`
Expected: PASS, 3 tests.

- [ ] **Step 7: Commit**

```bash
git add prisma package.json tests/db
git commit -m "feat: add Prisma schema, initial migration, and idempotent seed"
```

---

### Task 5: Isolated test database harness

**Files:**
- Create: `tests/helpers/db.ts`, `.env.test`
- Modify: `vitest.config.ts`, `.env.example`
- Test: `tests/db/harness.test.ts`

**Interfaces:**
- Consumes: `prisma` from `src/lib/db.ts`
- Produces: `resetDb(): Promise<void>` and `seedBaseline(): Promise<void>` from `tests/helpers/db.ts`

Task 4's tests wrote to the development database. That does not scale — tests must not destroy data an admin entered while trying the app.

- [ ] **Step 1: Point tests at the test database**

Create `.env.test`:

```
DATABASE_URL="postgresql://helping:helping_local_dev@localhost:5433/helping_hands_test?schema=public"
TZ="Asia/Kolkata"
```

Add `.env.test` to `.gitignore` (already added in Task 1 Step 2 — confirm it is there) and add a matching commented line to `.env.example`.

- [ ] **Step 2: Load it in Vitest**

Modify `vitest.config.ts` to load the test environment before anything imports Prisma:

```ts
import { config } from "dotenv";
import { defineConfig } from "vitest/config";
import tsconfigPaths from "vite-tsconfig-paths";

config({ path: ".env.test", override: true });

export default defineConfig({
  plugins: [tsconfigPaths()],
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
    globals: true,
    setupFiles: ["tests/helpers/db.ts"],
    fileParallelism: false,
  },
});
```

`fileParallelism: false` matters: parallel test files sharing one database would truncate each other's rows mid-test.

```bash
npm install -D dotenv
```

- [ ] **Step 3: Write the harness**

Create `tests/helpers/db.ts`:

```ts
import { beforeEach } from "vitest";
import { prisma } from "@/lib/db";

export const ANONYMOUS_CONTRIBUTOR_ID = "anonymous";

/** Order matters only for readability; TRUNCATE ... CASCADE handles the graph. */
const TABLES = [
  "AuditLog",
  "Attachment",
  "Disbursement",
  "Case",
  "Contribution",
  "Contributor",
  "Session",
  "Account",
  "User",
  "ReceiptCounter",
  "OrgSettings",
];

export async function resetDb(): Promise<void> {
  const list = TABLES.map((t) => `"${t}"`).join(", ");
  await prisma.$executeRawUnsafe(`TRUNCATE TABLE ${list} RESTART IDENTITY CASCADE;`);
}

export async function seedBaseline(): Promise<void> {
  await prisma.orgSettings.create({ data: { id: "singleton" } });
  await prisma.contributor.create({
    data: { id: ANONYMOUS_CONTRIBUTOR_ID, name: "Anonymous", isSystem: true },
  });
}

beforeEach(async () => {
  await resetDb();
  await seedBaseline();
});
```

- [ ] **Step 4: Apply migrations to the test database**

```bash
npx dotenv -e .env.test -- prisma migrate deploy
```

If `dotenv-cli` is unavailable, run with an inline variable instead:

```bash
DATABASE_URL="postgresql://helping:helping_local_dev@localhost:5433/helping_hands_test?schema=public" npx prisma migrate deploy
```

Add this as a script: `"db:test:migrate": "dotenv -e .env.test -- prisma migrate deploy"` and install `npm install -D dotenv-cli`.

- [ ] **Step 5: Write the harness test**

Create `tests/db/harness.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";

describe("test database harness", () => {
  it("starts each test with only baseline rows", async () => {
    expect(await prisma.contributor.count()).toBe(1);
    expect(await prisma.contribution.count()).toBe(0);

    await prisma.contributor.create({ data: { name: "Left over" } });
    expect(await prisma.contributor.count()).toBe(2);
  });

  it("does not see the previous test's rows", async () => {
    expect(await prisma.contributor.count()).toBe(1);
  });
});
```

The second test passing is the entire point — it proves the reset runs between tests.

- [ ] **Step 6: Run the full suite**

Run: `npm test`
Expected: PASS. Task 4's `schema.test.ts` still passes because the harness seeds the same baseline rows.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "test: isolate tests in a dedicated database with per-test reset"
```

---

### Task 6: Google sign-in with role bootstrap and contributor linking

**Files:**
- Create: `src/lib/auth.ts`, `src/app/api/auth/[...nextauth]/route.ts`, `src/app/login/page.tsx`
- Test: `tests/lib/auth-bootstrap.test.ts`

**Interfaces:**
- Consumes: `prisma` from `src/lib/db.ts`
- Produces:
  - `auth()`, `signIn()`, `signOut()`, `handlers` from `src/lib/auth.ts`
  - `resolveRoleForEmail(email: string): Role` — exported for testing
  - `linkContributorToUser(userId: string, email: string): Promise<void>`
  - `session.user` carries `id` and `role`

- [ ] **Step 1: Write the failing tests**

Create `tests/lib/auth-bootstrap.test.ts`:

```ts
import { beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { linkContributorToUser, resolveRoleForEmail } from "@/lib/auth";

describe("resolveRoleForEmail", () => {
  beforeEach(() => {
    process.env.ADMIN_EMAILS = "boss@example.com, Second.Admin@Example.com";
  });

  it("promotes a listed email to ADMIN", () => {
    expect(resolveRoleForEmail("boss@example.com")).toBe("ADMIN");
  });

  it("ignores case and surrounding spaces in the list", () => {
    expect(resolveRoleForEmail("second.admin@example.com")).toBe("ADMIN");
  });

  it("defaults everyone else to MEMBER", () => {
    expect(resolveRoleForEmail("friend@example.com")).toBe("MEMBER");
  });

  it("defaults to MEMBER when the list is unset", () => {
    delete process.env.ADMIN_EMAILS;
    expect(resolveRoleForEmail("boss@example.com")).toBe("MEMBER");
  });
});

describe("linkContributorToUser", () => {
  it("links an existing contributor with the same email", async () => {
    const user = await prisma.user.create({
      data: { email: "asha@example.com", name: "Asha" },
    });
    const contributor = await prisma.contributor.create({
      data: { name: "Asha", email: "asha@example.com" },
    });

    await linkContributorToUser(user.id, "asha@example.com");

    const linked = await prisma.contributor.findUnique({ where: { id: contributor.id } });
    expect(linked?.userId).toBe(user.id);
  });

  it("matches email case-insensitively", async () => {
    const user = await prisma.user.create({ data: { email: "ravi@example.com" } });
    const contributor = await prisma.contributor.create({
      data: { name: "Ravi", email: "Ravi@Example.com" },
    });

    await linkContributorToUser(user.id, "ravi@example.com");

    const linked = await prisma.contributor.findUnique({ where: { id: contributor.id } });
    expect(linked?.userId).toBe(user.id);
  });

  it("does nothing when no contributor matches", async () => {
    const user = await prisma.user.create({ data: { email: "nobody@example.com" } });
    await expect(linkContributorToUser(user.id, "nobody@example.com")).resolves.toBeUndefined();
    expect(await prisma.contributor.count({ where: { userId: user.id } })).toBe(0);
  });

  it("never steals a contributor already linked to someone else", async () => {
    const first = await prisma.user.create({ data: { email: "shared@example.com" } });
    const second = await prisma.user.create({ data: { email: "other@example.com" } });
    const contributor = await prisma.contributor.create({
      data: { name: "Shared", email: "shared@example.com", userId: first.id },
    });

    await linkContributorToUser(second.id, "shared@example.com");

    const linked = await prisma.contributor.findUnique({ where: { id: contributor.id } });
    expect(linked?.userId).toBe(first.id);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm test -- auth-bootstrap`
Expected: FAIL — cannot resolve `@/lib/auth`.

- [ ] **Step 3: Implement the auth module**

Create `src/lib/auth.ts`:

```ts
import NextAuth from "next-auth";
import Google from "next-auth/providers/google";
import { PrismaAdapter } from "@auth/prisma-adapter";
import type { Role } from "@prisma/client";
import { prisma } from "@/lib/db";

export function resolveRoleForEmail(email: string): Role {
  const list = (process.env.ADMIN_EMAILS ?? "")
    .split(",")
    .map((entry) => entry.trim().toLowerCase())
    .filter(Boolean);

  return list.includes(email.trim().toLowerCase()) ? "ADMIN" : "MEMBER";
}

/**
 * Attaches a pre-existing contributor record to a user who has just signed in.
 * Only ever fills an empty userId, so an existing link is never reassigned.
 */
export async function linkContributorToUser(userId: string, email: string): Promise<void> {
  const contributor = await prisma.contributor.findFirst({
    where: { email: { equals: email, mode: "insensitive" }, userId: null, isSystem: false },
  });

  if (!contributor) return;

  await prisma.contributor.update({ where: { id: contributor.id }, data: { userId } });
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  adapter: PrismaAdapter(prisma),
  providers: [Google],
  session: { strategy: "database" },
  pages: { signIn: "/login" },
  events: {
    async createUser({ user }) {
      if (!user.email || !user.id) return;
      await prisma.user.update({
        where: { id: user.id },
        data: { role: resolveRoleForEmail(user.email) },
      });
    },
    async signIn({ user }) {
      if (!user.email || !user.id) return;
      await linkContributorToUser(user.id, user.email);
    },
  },
  callbacks: {
    async session({ session, user }) {
      session.user.id = user.id;
      session.user.role = (user as { role: Role }).role;
      return session;
    },
  },
});
```

- [ ] **Step 4: Add session typing**

Create `src/types/next-auth.d.ts`:

```ts
import type { Role } from "@prisma/client";
import type { DefaultSession } from "next-auth";

declare module "next-auth" {
  interface Session {
    user: { id: string; role: Role } & DefaultSession["user"];
  }
}
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npm test -- auth-bootstrap`
Expected: PASS, all tests.

- [ ] **Step 6: Wire the route handler and login page**

Create `src/app/api/auth/[...nextauth]/route.ts`:

```ts
export { GET, POST } from "@/lib/auth";
```

Create `src/app/login/page.tsx`:

```tsx
import { signIn } from "@/lib/auth";

export default function LoginPage() {
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-sm flex-col justify-center gap-6 p-6">
      <div>
        <h1 className="text-2xl font-semibold">Helping Hands</h1>
        <p className="mt-1 text-sm text-neutral-600">
          Sign in to see your contributions.
        </p>
      </div>
      <form
        action={async () => {
          "use server";
          await signIn("google", { redirectTo: "/me" });
        }}
      >
        <button
          type="submit"
          className="min-h-[44px] w-full rounded-lg bg-neutral-900 px-4 text-white"
        >
          Continue with Google
        </button>
      </form>
    </main>
  );
}
```

- [ ] **Step 7: Configure Google OAuth and verify sign-in manually**

In Google Cloud Console, create an OAuth 2.0 Client ID (Web application) with authorised redirect URI `http://localhost:3000/api/auth/callback/google`. Put the client ID and secret in `.env`.

Run `npm run dev`, visit `http://localhost:3000/login`, sign in with the address in `ADMIN_EMAILS`, then confirm:

```bash
docker compose exec db psql -U helping -d helping_hands -c 'SELECT email, role FROM "User";'
```

Expected: your email with role `ADMIN`.

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "feat: add Google sign-in with admin bootstrap and contributor linking"
```

---

### Task 7: Authorization guards

**Files:**
- Create: `src/lib/authz.ts`, `src/app/me/layout.tsx`
- Test: `tests/lib/authz.test.ts`

**Note on middleware:** this project deliberately does **not** use `src/middleware.ts`
for authorization. Next.js middleware runs on the Edge runtime, `src/lib/auth.ts`
pulls in Prisma, and Prisma does not run on Edge — so with database sessions the
middleware cannot read the session at all. Guards live in the route-group layouts,
which run on the Node runtime, and every server action re-checks independently.

**Interfaces:**
- Consumes: `auth()` from `src/lib/auth.ts`
- Produces:
  - `requireUser(): Promise<SessionUser>` — throws `UnauthenticatedError`
  - `requireAdmin(): Promise<SessionUser>` — throws `UnauthenticatedError` or `ForbiddenError`
  - `requireUserOrRedirect()`, `requireAdminOrRedirect()` — layout/page variants that redirect instead of throwing
  - `type SessionUser = { id: string; email: string; role: Role }`
  - `class UnauthenticatedError extends Error`, `class ForbiddenError extends Error`

- [ ] **Step 1: Write the failing tests**

Create `tests/lib/authz.test.ts`. `auth()` is mocked so the guards are tested without a browser session.

```ts
import { beforeEach, describe, expect, it, vi } from "vitest";

const authMock = vi.fn();
vi.mock("@/lib/auth", () => ({ auth: authMock }));

const { ForbiddenError, UnauthenticatedError, requireAdmin, requireUser } = await import(
  "@/lib/authz"
);

describe("requireUser", () => {
  beforeEach(() => authMock.mockReset());

  it("returns the signed-in user", async () => {
    authMock.mockResolvedValue({
      user: { id: "u1", email: "a@example.com", role: "MEMBER" },
    });
    await expect(requireUser()).resolves.toMatchObject({ id: "u1", role: "MEMBER" });
  });

  it("throws when there is no session", async () => {
    authMock.mockResolvedValue(null);
    await expect(requireUser()).rejects.toBeInstanceOf(UnauthenticatedError);
  });

  it("throws when the session has no user", async () => {
    authMock.mockResolvedValue({});
    await expect(requireUser()).rejects.toBeInstanceOf(UnauthenticatedError);
  });
});

describe("requireAdmin", () => {
  beforeEach(() => authMock.mockReset());

  it("returns an admin", async () => {
    authMock.mockResolvedValue({
      user: { id: "u1", email: "boss@example.com", role: "ADMIN" },
    });
    await expect(requireAdmin()).resolves.toMatchObject({ role: "ADMIN" });
  });

  it("rejects a member with ForbiddenError, not Unauthenticated", async () => {
    authMock.mockResolvedValue({
      user: { id: "u2", email: "friend@example.com", role: "MEMBER" },
    });
    await expect(requireAdmin()).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("rejects an anonymous visitor", async () => {
    authMock.mockResolvedValue(null);
    await expect(requireAdmin()).rejects.toBeInstanceOf(UnauthenticatedError);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm test -- authz`
Expected: FAIL — cannot resolve `@/lib/authz`.

- [ ] **Step 3: Implement the guards**

Create `src/lib/authz.ts`:

```ts
import type { Role } from "@prisma/client";
import { auth } from "@/lib/auth";

export type SessionUser = { id: string; email: string; role: Role };

export class UnauthenticatedError extends Error {
  constructor() {
    super("Sign in required");
    this.name = "UnauthenticatedError";
  }
}

export class ForbiddenError extends Error {
  constructor() {
    super("Admin access required");
    this.name = "ForbiddenError";
  }
}

export async function requireUser(): Promise<SessionUser> {
  const session = await auth();
  const user = session?.user;
  if (!user?.id || !user.email) throw new UnauthenticatedError();
  return { id: user.id, email: user.email, role: user.role };
}

export async function requireAdmin(): Promise<SessionUser> {
  const user = await requireUser();
  if (user.role !== "ADMIN") throw new ForbiddenError();
  return user;
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm test -- authz`
Expected: PASS, all tests.

- [ ] **Step 5: Add redirect helpers for use in layouts**

Append to `src/lib/authz.ts`. These wrap the throwing guards for page and layout
use, where a redirect is friendlier than an error boundary.

```ts
import { redirect } from "next/navigation";

export async function requireUserOrRedirect(): Promise<SessionUser> {
  try {
    return await requireUser();
  } catch {
    redirect("/login");
  }
}

export async function requireAdminOrRedirect(): Promise<SessionUser> {
  const user = await requireUserOrRedirect();
  if (user.role !== "ADMIN") redirect("/me");
  return user;
}
```

`redirect()` throws a control-flow signal that Next.js handles, so it must sit
outside the `try` block that swallows errors — hence the shape above.

- [ ] **Step 6: Guard the member area**

Create `src/app/me/layout.tsx`:

```tsx
import { requireUserOrRedirect } from "@/lib/authz";

export default async function MeLayout({ children }: { children: React.ReactNode }) {
  await requireUserOrRedirect();
  return <>{children}</>;
}
```

The admin area gets the same treatment in Task 11, where its layout is created.

- [ ] **Step 7: Verify manually**

Run `npm run dev`. Signed out, visit `/me` — expect a redirect to `/login`. Signed in, expect `/me` to render (a 404 from Next is fine at this point; the redirect not firing is what matters).

- [ ] **Step 8: Commit**

```bash
git add src/lib/authz.ts src/app/me tests/lib/authz.test.ts
git commit -m "feat: add authorization guards enforced in layouts and actions"
```

---

### Task 8: Audit log

**Files:**
- Create: `src/lib/audit.ts`
- Test: `tests/lib/audit.test.ts`

**Interfaces:**
- Consumes: `prisma`, Prisma type `AuditAction`
- Produces: `recordAudit(input: { userId?: string | null; action: AuditAction; entityType: string; entityId: string; before?: unknown; after?: unknown; tx?: PrismaTx }): Promise<void>` and `type PrismaTx = Omit<PrismaClient, "$connect" | "$disconnect" | "$on" | "$transaction" | "$use" | "$extends">`

- [ ] **Step 1: Write the failing tests**

Create `tests/lib/audit.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { recordAudit } from "@/lib/audit";

describe("recordAudit", () => {
  it("writes an entry with before and after snapshots", async () => {
    const user = await prisma.user.create({ data: { email: "boss@example.com" } });

    await recordAudit({
      userId: user.id,
      action: "UPDATE",
      entityType: "Contribution",
      entityId: "c1",
      before: { amountPaise: 50000 },
      after: { amountPaise: 60000 },
    });

    const entry = await prisma.auditLog.findFirst({ where: { entityId: "c1" } });
    expect(entry?.action).toBe("UPDATE");
    expect(entry?.before).toEqual({ amountPaise: 50000 });
    expect(entry?.after).toEqual({ amountPaise: 60000 });
  });

  it("survives an unknown user", async () => {
    await recordAudit({
      userId: null,
      action: "CREATE",
      entityType: "Contributor",
      entityId: "x1",
    });
    expect(await prisma.auditLog.count({ where: { entityId: "x1" } })).toBe(1);
  });

  it("participates in a transaction and rolls back with it", async () => {
    await expect(
      prisma.$transaction(async (tx) => {
        await recordAudit({
          action: "CREATE",
          entityType: "Contribution",
          entityId: "rollback",
          tx,
        });
        throw new Error("boom");
      }),
    ).rejects.toThrow("boom");

    expect(await prisma.auditLog.count({ where: { entityId: "rollback" } })).toBe(0);
  });
});
```

The third test is the important one: an audit row that survives a failed write is a lie about what happened.

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm test -- audit`
Expected: FAIL — cannot resolve `@/lib/audit`.

- [ ] **Step 3: Implement the module**

Create `src/lib/audit.ts`:

```ts
import type { AuditAction, Prisma, PrismaClient } from "@prisma/client";
import { prisma } from "@/lib/db";

export type PrismaTx = Omit<
  PrismaClient,
  "$connect" | "$disconnect" | "$on" | "$transaction" | "$use" | "$extends"
>;

export async function recordAudit(input: {
  userId?: string | null;
  action: AuditAction;
  entityType: string;
  entityId: string;
  before?: unknown;
  after?: unknown;
  tx?: PrismaTx;
}): Promise<void> {
  const client = input.tx ?? prisma;

  await client.auditLog.create({
    data: {
      userId: input.userId ?? null,
      action: input.action,
      entityType: input.entityType,
      entityId: input.entityId,
      before: (input.before ?? undefined) as Prisma.InputJsonValue | undefined,
      after: (input.after ?? undefined) as Prisma.InputJsonValue | undefined,
    },
  });
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm test -- audit`
Expected: PASS, 3 tests.

- [ ] **Step 5: Commit**

```bash
git add src/lib/audit.ts tests/lib/audit.test.ts
git commit -m "feat: add transaction-aware audit logging"
```

---

### Task 9: Receipt number allocation

**Files:**
- Create: `src/lib/receipts.ts`
- Test: `tests/lib/receipts.test.ts`

**Interfaces:**
- Consumes: `financialYearOf` from `src/lib/fy.ts`, `PrismaTx` from `src/lib/audit.ts`
- Produces: `allocateReceiptNo(receivedOn: Date | string, prefix: string, tx?: PrismaTx): Promise<string>`

- [ ] **Step 1: Write the failing tests**

Create `tests/lib/receipts.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { allocateReceiptNo } from "@/lib/receipts";

describe("allocateReceiptNo", () => {
  it("formats as prefix/financial-year/zero-padded sequence", async () => {
    expect(await allocateReceiptNo("2026-08-28", "HH")).toBe("HH/2026-27/0001");
  });

  it("increments within a financial year", async () => {
    await allocateReceiptNo("2026-08-28", "HH");
    expect(await allocateReceiptNo("2026-09-01", "HH")).toBe("HH/2026-27/0002");
  });

  it("keeps a separate sequence per financial year", async () => {
    await allocateReceiptNo("2026-08-28", "HH");
    expect(await allocateReceiptNo("2027-05-01", "HH")).toBe("HH/2027-28/0001");
  });

  it("uses the received date, not today, so back-dated entries land correctly", async () => {
    expect(await allocateReceiptNo("2025-06-10", "HH")).toBe("HH/2025-26/0001");
  });

  it("respects the 31 March boundary", async () => {
    expect(await allocateReceiptNo("2027-03-31", "HH")).toBe("HH/2026-27/0001");
    expect(await allocateReceiptNo("2027-04-01", "HH")).toBe("HH/2027-28/0001");
  });

  it("never issues a duplicate under concurrency", async () => {
    const results = await Promise.all(
      Array.from({ length: 25 }, () => allocateReceiptNo("2026-08-28", "HH")),
    );

    expect(new Set(results).size).toBe(25);
    const sequences = results.map((r) => Number(r.split("/")[2])).sort((a, b) => a - b);
    expect(sequences).toEqual(Array.from({ length: 25 }, (_, i) => i + 1));
  });

  it("records the counter state in the database", async () => {
    await allocateReceiptNo("2026-08-28", "HH");
    await allocateReceiptNo("2026-08-29", "HH");
    const counter = await prisma.receiptCounter.findUnique({
      where: { financialYear: "2026-27" },
    });
    expect(counter?.lastSequence).toBe(2);
  });
});
```

The concurrency test is the reason this module exists. Two admins entering contributions at once must never produce the same receipt number.

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm test -- receipts`
Expected: FAIL — cannot resolve `@/lib/receipts`.

- [ ] **Step 3: Implement the module**

Create `src/lib/receipts.ts`. A read-then-write would race; a single atomic upsert-and-increment in Postgres cannot.

```ts
import type { PrismaTx } from "@/lib/audit";
import { prisma } from "@/lib/db";
import { financialYearOf } from "@/lib/fy";

export async function allocateReceiptNo(
  receivedOn: Date | string,
  prefix: string,
  tx?: PrismaTx,
): Promise<string> {
  const client = tx ?? prisma;
  const fy = financialYearOf(receivedOn);

  const rows = await client.$queryRaw<{ lastSequence: number }[]>`
    INSERT INTO "ReceiptCounter" ("financialYear", "lastSequence")
    VALUES (${fy}, 1)
    ON CONFLICT ("financialYear")
    DO UPDATE SET "lastSequence" = "ReceiptCounter"."lastSequence" + 1
    RETURNING "lastSequence"
  `;

  const sequence = rows[0].lastSequence;
  return `${prefix}/${fy}/${String(sequence).padStart(4, "0")}`;
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm test -- receipts`
Expected: PASS, all 7 tests, including the concurrency case.

- [ ] **Step 5: Commit**

```bash
git add src/lib/receipts.ts tests/lib/receipts.test.ts
git commit -m "feat: add atomic per-financial-year receipt numbering"
```

---

### Task 10: Contributor and contribution data layer

**Files:**
- Create: `src/lib/data/contributors.ts`, `src/lib/data/contributions.ts`
- Test: `tests/data/contributors.test.ts`, `tests/data/contributions.test.ts`

**Interfaces:**
- Consumes: `prisma`, `recordAudit`, `allocateReceiptNo`, `financialYearRange`
- Produces:
  - `listContributors(query?: string)`, `getContributor(id)`, `createContributor(input, actorId)`, `updateContributor(id, input, actorId)`
  - `type ContributorInput = { name: string; email?: string | null; phone?: string | null; pan?: string | null; addressLine?: string | null; city?: string | null; state?: string | null; pincode?: string | null; notes?: string | null }`
  - `createContribution(input, actorId): Promise<Contribution>` where `type ContributionInput = { contributorId: string; amountPaise: number; receivedOn: Date; mode: PaymentMode; reference?: string | null; note?: string | null }`
  - `voidContribution(id, actorId): Promise<void>`
  - `listContributions(filter?: { financialYear?: string; contributorId?: string })`
  - `listMyContributions(userId: string)`
  - `ledgerTotals(): Promise<{ collectedPaise: bigint; disbursedPaise: bigint; balancePaise: bigint }>`

- [ ] **Step 1: Write the failing contributor tests**

Create `tests/data/contributors.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { createContributor, listContributors, updateContributor } from "@/lib/data/contributors";

describe("createContributor", () => {
  it("stores the contributor and writes an audit entry", async () => {
    const actor = await prisma.user.create({ data: { email: "boss@example.com" } });

    const created = await createContributor({ name: "Asha", email: "asha@example.com" }, actor.id);

    expect(created.name).toBe("Asha");
    const audit = await prisma.auditLog.findFirst({ where: { entityId: created.id } });
    expect(audit?.action).toBe("CREATE");
    expect(audit?.userId).toBe(actor.id);
  });

  it("trims whitespace and lowercases the email", async () => {
    const created = await createContributor({ name: "  Ravi  ", email: " Ravi@Example.COM " }, null);
    expect(created.name).toBe("Ravi");
    expect(created.email).toBe("ravi@example.com");
  });

  it("rejects an empty name", async () => {
    await expect(createContributor({ name: "   " }, null)).rejects.toThrow();
  });
});

describe("listContributors", () => {
  it("excludes the system Anonymous contributor by default", async () => {
    await createContributor({ name: "Asha" }, null);
    const list = await listContributors();
    expect(list.map((c) => c.name)).toEqual(["Asha"]);
  });

  it("searches by name and email, case-insensitively", async () => {
    await createContributor({ name: "Asha Nair", email: "asha@example.com" }, null);
    await createContributor({ name: "Ravi Kumar", email: "ravi@example.com" }, null);

    expect((await listContributors("asha")).length).toBe(1);
    expect((await listContributors("RAVI@")).length).toBe(1);
    expect((await listContributors("kumar")).length).toBe(1);
  });
});

describe("updateContributor", () => {
  it("records before and after in the audit log", async () => {
    const created = await createContributor({ name: "Asha" }, null);
    await updateContributor(created.id, { name: "Asha Nair" }, null);

    const audit = await prisma.auditLog.findFirst({
      where: { entityId: created.id, action: "UPDATE" },
    });
    expect((audit?.before as { name: string }).name).toBe("Asha");
    expect((audit?.after as { name: string }).name).toBe("Asha Nair");
  });

  it("refuses to modify the system contributor", async () => {
    await expect(updateContributor("anonymous", { name: "Hacked" }, null)).rejects.toThrow();
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npm test -- contributors`
Expected: FAIL — cannot resolve `@/lib/data/contributors`.

- [ ] **Step 3: Implement the contributor data module**

Create `src/lib/data/contributors.ts`:

```ts
import { z } from "zod";
import { recordAudit } from "@/lib/audit";
import { prisma } from "@/lib/db";

export const contributorSchema = z.object({
  name: z.string().trim().min(1, "Name is required"),
  email: z.string().trim().toLowerCase().email().optional().nullable().or(z.literal("")),
  phone: z.string().trim().optional().nullable(),
  pan: z.string().trim().toUpperCase().optional().nullable(),
  addressLine: z.string().trim().optional().nullable(),
  city: z.string().trim().optional().nullable(),
  state: z.string().trim().optional().nullable(),
  pincode: z.string().trim().optional().nullable(),
  notes: z.string().trim().optional().nullable(),
});

export type ContributorInput = z.infer<typeof contributorSchema>;

function normalise(input: ContributorInput) {
  const parsed = contributorSchema.parse(input);
  return { ...parsed, email: parsed.email ? parsed.email : null };
}

export async function listContributors(query?: string) {
  return prisma.contributor.findMany({
    where: {
      isSystem: false,
      ...(query
        ? {
            OR: [
              { name: { contains: query, mode: "insensitive" as const } },
              { email: { contains: query, mode: "insensitive" as const } },
            ],
          }
        : {}),
    },
    orderBy: { name: "asc" },
  });
}

export async function getContributor(id: string) {
  return prisma.contributor.findUnique({ where: { id } });
}

export async function createContributor(input: ContributorInput, actorId: string | null) {
  const data = normalise(input);
  const created = await prisma.contributor.create({ data });

  await recordAudit({
    userId: actorId,
    action: "CREATE",
    entityType: "Contributor",
    entityId: created.id,
    after: data,
  });

  return created;
}

export async function updateContributor(
  id: string,
  input: ContributorInput,
  actorId: string | null,
) {
  const before = await prisma.contributor.findUnique({ where: { id } });
  if (!before) throw new Error("Contributor not found");
  if (before.isSystem) throw new Error("The Anonymous contributor cannot be edited");

  const data = normalise(input);
  const updated = await prisma.contributor.update({ where: { id }, data });

  await recordAudit({
    userId: actorId,
    action: "UPDATE",
    entityType: "Contributor",
    entityId: id,
    before: { name: before.name, email: before.email, phone: before.phone, pan: before.pan },
    after: data,
  });

  return updated;
}
```

- [ ] **Step 4: Run to verify the contributor tests pass**

Run: `npm test -- contributors`
Expected: PASS, all tests.

- [ ] **Step 5: Write the failing contribution tests**

Create `tests/data/contributions.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { createContributor } from "@/lib/data/contributors";
import {
  createContribution,
  ledgerTotals,
  listContributions,
  listMyContributions,
  voidContribution,
} from "@/lib/data/contributions";

async function aContributor(name = "Asha", email?: string) {
  return createContributor({ name, email: email ?? null }, null);
}

describe("createContribution", () => {
  it("stores paise and assigns a receipt number from the received date", async () => {
    const contributor = await aContributor();

    const created = await createContribution(
      {
        contributorId: contributor.id,
        amountPaise: 250000,
        receivedOn: new Date(Date.UTC(2026, 7, 28)),
        mode: "UPI",
        reference: "UTR123",
      },
      null,
    );

    expect(created.amountPaise).toBe(250000);
    expect(created.receiptNo).toBe("HH/2026-27/0001");
    expect(created.status).toBe("ACTIVE");
  });

  it("uses the receipt prefix from settings", async () => {
    await prisma.orgSettings.update({
      where: { id: "singleton" },
      data: { receiptPrefix: "HHF" },
    });
    const contributor = await aContributor();

    const created = await createContribution(
      {
        contributorId: contributor.id,
        amountPaise: 100,
        receivedOn: new Date(Date.UTC(2026, 7, 28)),
        mode: "CASH",
      },
      null,
    );

    expect(created.receiptNo?.startsWith("HHF/")).toBe(true);
  });

  it("rejects a zero or negative amount", async () => {
    const contributor = await aContributor();
    await expect(
      createContribution(
        {
          contributorId: contributor.id,
          amountPaise: 0,
          receivedOn: new Date(Date.UTC(2026, 7, 28)),
          mode: "CASH",
        },
        null,
      ),
    ).rejects.toThrow();
  });

  it("allows recording against the Anonymous contributor", async () => {
    const created = await createContribution(
      {
        contributorId: "anonymous",
        amountPaise: 100000,
        receivedOn: new Date(Date.UTC(2026, 7, 28)),
        mode: "CASH",
      },
      null,
    );
    expect(created.contributorId).toBe("anonymous");
  });

  it("writes an audit entry", async () => {
    const contributor = await aContributor();
    const created = await createContribution(
      {
        contributorId: contributor.id,
        amountPaise: 100,
        receivedOn: new Date(Date.UTC(2026, 7, 28)),
        mode: "CASH",
      },
      null,
    );
    const audit = await prisma.auditLog.findFirst({
      where: { entityType: "Contribution", entityId: created.id },
    });
    expect(audit?.action).toBe("CREATE");
  });
});

describe("voidContribution", () => {
  it("marks the row VOID instead of deleting it, keeping the receipt number", async () => {
    const contributor = await aContributor();
    const created = await createContribution(
      {
        contributorId: contributor.id,
        amountPaise: 100000,
        receivedOn: new Date(Date.UTC(2026, 7, 28)),
        mode: "CASH",
      },
      null,
    );

    await voidContribution(created.id, null);

    const after = await prisma.contribution.findUnique({ where: { id: created.id } });
    expect(after).not.toBeNull();
    expect(after?.status).toBe("VOID");
    expect(after?.receiptNo).toBe(created.receiptNo);
  });

  it("excludes voided money from the ledger totals", async () => {
    const contributor = await aContributor();
    const keep = await createContribution(
      {
        contributorId: contributor.id,
        amountPaise: 100000,
        receivedOn: new Date(Date.UTC(2026, 7, 28)),
        mode: "CASH",
      },
      null,
    );
    const drop = await createContribution(
      {
        contributorId: contributor.id,
        amountPaise: 500000,
        receivedOn: new Date(Date.UTC(2026, 7, 28)),
        mode: "CASH",
      },
      null,
    );

    await voidContribution(drop.id, null);

    const totals = await ledgerTotals();
    expect(totals.collectedPaise).toBe(100000n);
    expect(keep.status).toBe("ACTIVE");
  });
});

describe("listContributions", () => {
  it("filters by financial year using receivedOn", async () => {
    const contributor = await aContributor();
    await createContribution(
      {
        contributorId: contributor.id,
        amountPaise: 100,
        receivedOn: new Date(Date.UTC(2026, 2, 31)),
        mode: "CASH",
      },
      null,
    );
    await createContribution(
      {
        contributorId: contributor.id,
        amountPaise: 200,
        receivedOn: new Date(Date.UTC(2026, 3, 1)),
        mode: "CASH",
      },
      null,
    );

    expect((await listContributions({ financialYear: "2025-26" })).length).toBe(1);
    expect((await listContributions({ financialYear: "2026-27" })).length).toBe(1);
  });
});

describe("listMyContributions", () => {
  it("returns only the signed-in user's own contributions", async () => {
    const mine = await prisma.user.create({ data: { email: "asha@example.com" } });
    const asha = await aContributor("Asha", "asha@example.com");
    await prisma.contributor.update({ where: { id: asha.id }, data: { userId: mine.id } });
    const ravi = await aContributor("Ravi", "ravi@example.com");

    await createContribution(
      {
        contributorId: asha.id,
        amountPaise: 100000,
        receivedOn: new Date(Date.UTC(2026, 7, 28)),
        mode: "UPI",
      },
      null,
    );
    await createContribution(
      {
        contributorId: ravi.id,
        amountPaise: 900000,
        receivedOn: new Date(Date.UTC(2026, 7, 28)),
        mode: "UPI",
      },
      null,
    );

    const list = await listMyContributions(mine.id);
    expect(list.length).toBe(1);
    expect(list[0].amountPaise).toBe(100000);
  });

  it("returns nothing for a user with no linked contributor", async () => {
    const stranger = await prisma.user.create({ data: { email: "nobody@example.com" } });
    expect(await listMyContributions(stranger.id)).toEqual([]);
  });

  it("hides voided contributions from the member", async () => {
    const mine = await prisma.user.create({ data: { email: "asha@example.com" } });
    const asha = await aContributor("Asha", "asha@example.com");
    await prisma.contributor.update({ where: { id: asha.id }, data: { userId: mine.id } });

    const created = await createContribution(
      {
        contributorId: asha.id,
        amountPaise: 100000,
        receivedOn: new Date(Date.UTC(2026, 7, 28)),
        mode: "UPI",
      },
      null,
    );
    await voidContribution(created.id, null);

    expect(await listMyContributions(mine.id)).toEqual([]);
  });
});
```

- [ ] **Step 6: Run to verify failure**

Run: `npm test -- data/contributions`
Expected: FAIL — cannot resolve `@/lib/data/contributions`.

- [ ] **Step 7: Implement the contribution data module**

Create `src/lib/data/contributions.ts`:

```ts
import { z } from "zod";
import { recordAudit } from "@/lib/audit";
import { prisma } from "@/lib/db";
import { financialYearRange, toDateOnly } from "@/lib/fy";
import { allocateReceiptNo } from "@/lib/receipts";

export const contributionSchema = z.object({
  contributorId: z.string().min(1),
  amountPaise: z.number().int().positive("Amount must be greater than zero"),
  receivedOn: z.date(),
  mode: z.enum(["UPI", "CASH", "BANK", "CHEQUE", "OTHER"]),
  reference: z.string().trim().optional().nullable(),
  note: z.string().trim().optional().nullable(),
});

export type ContributionInput = z.infer<typeof contributionSchema>;

export async function createContribution(input: ContributionInput, actorId: string | null) {
  const data = contributionSchema.parse(input);
  const receivedOn = toDateOnly(data.receivedOn);

  const settings = await prisma.orgSettings.findUniqueOrThrow({ where: { id: "singleton" } });

  const created = await prisma.$transaction(async (tx) => {
    const receiptNo = await allocateReceiptNo(receivedOn, settings.receiptPrefix, tx);

    const row = await tx.contribution.create({
      data: {
        contributorId: data.contributorId,
        amountPaise: data.amountPaise,
        receivedOn,
        mode: data.mode,
        reference: data.reference || null,
        note: data.note || null,
        receiptNo,
        recordedByUserId: actorId,
      },
    });

    await recordAudit({
      userId: actorId,
      action: "CREATE",
      entityType: "Contribution",
      entityId: row.id,
      after: { amountPaise: row.amountPaise, receiptNo: row.receiptNo, mode: row.mode },
      tx,
    });

    return row;
  });

  return created;
}

export async function voidContribution(id: string, actorId: string | null) {
  const before = await prisma.contribution.findUnique({ where: { id } });
  if (!before) throw new Error("Contribution not found");
  if (before.status === "VOID") return;

  await prisma.$transaction(async (tx) => {
    await tx.contribution.update({ where: { id }, data: { status: "VOID" } });
    await recordAudit({
      userId: actorId,
      action: "VOID",
      entityType: "Contribution",
      entityId: id,
      before: { status: before.status, amountPaise: before.amountPaise },
      after: { status: "VOID" },
      tx,
    });
  });
}

export async function listContributions(filter?: {
  financialYear?: string;
  contributorId?: string;
}) {
  const range = filter?.financialYear ? financialYearRange(filter.financialYear) : null;

  return prisma.contribution.findMany({
    where: {
      ...(filter?.contributorId ? { contributorId: filter.contributorId } : {}),
      ...(range ? { receivedOn: { gte: range.start, lte: range.end } } : {}),
    },
    include: { contributor: { select: { id: true, name: true } } },
    orderBy: [{ receivedOn: "desc" }, { createdAt: "desc" }],
  });
}

/**
 * The single place the "only my own data" filter lives.
 * Every member-facing read goes through here.
 */
export async function listMyContributions(userId: string) {
  return prisma.contribution.findMany({
    where: { status: "ACTIVE", contributor: { userId } },
    orderBy: { receivedOn: "desc" },
  });
}

export async function ledgerTotals() {
  const [collected, disbursed] = await Promise.all([
    prisma.contribution.aggregate({
      where: { status: "ACTIVE" },
      _sum: { amountPaise: true },
    }),
    prisma.disbursement.aggregate({ _sum: { amountPaise: true } }),
  ]);

  const collectedPaise = BigInt(collected._sum.amountPaise ?? 0);
  const disbursedPaise = BigInt(disbursed._sum.amountPaise ?? 0);

  return { collectedPaise, disbursedPaise, balancePaise: collectedPaise - disbursedPaise };
}
```

- [ ] **Step 8: Run to verify the tests pass**

Run: `npm test`
Expected: PASS, entire suite.

- [ ] **Step 9: Commit**

```bash
git add src/lib/data tests/data
git commit -m "feat: add contributor and contribution data layer with audit and receipts"
```

---

### Task 11: Mobile-first UI primitives and admin shell

**Files:**
- Create: `src/components/ui/Button.tsx`, `src/components/ui/Field.tsx`, `src/components/ui/AmountInput.tsx`, `src/components/ui/Money.tsx`, `src/components/RecordList.tsx`, `src/components/AdminShell.tsx`, `src/app/admin/layout.tsx`
- Modify: `src/app/globals.css`, `src/app/layout.tsx`
- Test: `tests/lib/money-display.test.ts`

**Interfaces:**
- Consumes: `formatPaise`, `formatPaiseCompact` from `src/lib/money.ts`
- Produces:
  - `<Button variant="primary" | "secondary" | "danger">`
  - `<Field label htmlFor error>` wrapper
  - `<AmountInput name defaultValue label>` — renders `inputmode="numeric"`
  - `<Money paise>` — renders formatted rupees
  - `<RecordList items columns renderCard>` — table at `sm` and above, cards below
  - `<AdminShell>` — bottom tab bar on mobile, sidebar on desktop

- [ ] **Step 1: Set the viewport and base metadata**

Modify `src/app/layout.tsx` to export viewport settings — without this, mobile browsers render at desktop width and every mobile-first rule in the spec is defeated:

```tsx
import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Helping Hands",
  description: "Contributions and help, recorded openly.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-dvh bg-neutral-50 text-neutral-900 antialiased">{children}</body>
    </html>
  );
}
```

- [ ] **Step 2: Build the button**

Create `src/components/ui/Button.tsx`. The `min-h-[44px]` is the spec's tap-target rule and belongs in the primitive so no page can forget it.

```tsx
import type { ButtonHTMLAttributes } from "react";

type Variant = "primary" | "secondary" | "danger";

const styles: Record<Variant, string> = {
  primary: "bg-neutral-900 text-white hover:bg-neutral-800",
  secondary: "bg-white text-neutral-900 border border-neutral-300 hover:bg-neutral-100",
  danger: "bg-red-600 text-white hover:bg-red-700",
};

export function Button({
  variant = "primary",
  className = "",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant }) {
  return (
    <button
      {...props}
      className={`inline-flex min-h-[44px] items-center justify-center rounded-lg px-4 text-sm font-medium disabled:opacity-50 ${styles[variant]} ${className}`}
    />
  );
}
```

- [ ] **Step 3: Build the field wrapper and amount input**

Create `src/components/ui/Field.tsx`:

```tsx
export function Field({
  label,
  htmlFor,
  error,
  children,
}: {
  label: string;
  htmlFor: string;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={htmlFor} className="text-sm font-medium text-neutral-700">
        {label}
      </label>
      {children}
      {error ? <p className="text-sm text-red-600">{error}</p> : null}
    </div>
  );
}

export const inputClass =
  "min-h-[44px] w-full rounded-lg border border-neutral-300 bg-white px-3 text-base outline-none focus:border-neutral-900";
```

`text-base` is deliberate: iOS Safari zooms the page when a focused input has a font size below 16px.

Create `src/components/ui/AmountInput.tsx`:

```tsx
import { Field, inputClass } from "@/components/ui/Field";

export function AmountInput({
  name = "amount",
  label = "Amount",
  defaultValue,
  error,
}: {
  name?: string;
  label?: string;
  defaultValue?: string;
  error?: string;
}) {
  return (
    <Field label={label} htmlFor={name} error={error}>
      <div className="relative">
        <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-neutral-500">
          ₹
        </span>
        <input
          id={name}
          name={name}
          type="text"
          inputMode="numeric"
          autoComplete="off"
          placeholder="0"
          defaultValue={defaultValue}
          className={`${inputClass} pl-7`}
        />
      </div>
    </Field>
  );
}
```

- [ ] **Step 4: Build the money display component**

Create `src/components/ui/Money.tsx`:

```tsx
import { formatPaise, formatPaiseCompact } from "@/lib/money";

export function Money({
  paise,
  compact = false,
}: {
  paise: number | bigint;
  compact?: boolean;
}) {
  return (
    <span className="tabular-nums">
      {compact ? formatPaiseCompact(paise) : formatPaise(paise)}
    </span>
  );
}
```

- [ ] **Step 5: Build the responsive record list**

Create `src/components/RecordList.tsx`. This component is how the spec's "tables become cards below `sm`" rule is honoured once, rather than per page.

```tsx
import type { ReactNode } from "react";

export type Column<T> = { key: string; header: string; cell: (item: T) => ReactNode };

export function RecordList<T extends { id: string }>({
  items,
  columns,
  renderCard,
  empty = "Nothing here yet.",
}: {
  items: T[];
  columns: Column<T>[];
  renderCard: (item: T) => ReactNode;
  empty?: string;
}) {
  if (items.length === 0) {
    return <p className="rounded-lg bg-white p-6 text-center text-neutral-500">{empty}</p>;
  }

  return (
    <>
      <ul className="flex flex-col gap-3 sm:hidden">
        {items.map((item) => (
          <li key={item.id} className="rounded-lg border border-neutral-200 bg-white p-4">
            {renderCard(item)}
          </li>
        ))}
      </ul>

      <div className="hidden overflow-hidden rounded-lg border border-neutral-200 bg-white sm:block">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-neutral-200 bg-neutral-50">
            <tr>
              {columns.map((column) => (
                <th key={column.key} className="px-4 py-3 font-medium text-neutral-600">
                  {column.header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {items.map((item) => (
              <tr key={item.id} className="border-b border-neutral-100 last:border-0">
                {columns.map((column) => (
                  <td key={column.key} className="px-4 py-3">
                    {column.cell(item)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
```

- [ ] **Step 6: Build the admin shell**

Create `src/components/AdminShell.tsx`:

```tsx
import Link from "next/link";

const TABS = [
  { href: "/admin", label: "Home" },
  { href: "/admin/contributions", label: "Money in" },
  { href: "/admin/contributors", label: "People" },
];

export function AdminShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-5xl flex-col sm:flex-row">
      <nav className="hidden w-52 shrink-0 border-r border-neutral-200 p-4 sm:block">
        <p className="px-3 pb-4 text-sm font-semibold">Helping Hands</p>
        <ul className="flex flex-col gap-1">
          {TABS.map((tab) => (
            <li key={tab.href}>
              <Link
                href={tab.href}
                className="flex min-h-[44px] items-center rounded-lg px-3 text-sm hover:bg-neutral-100"
              >
                {tab.label}
              </Link>
            </li>
          ))}
        </ul>
      </nav>

      <main className="flex-1 p-4 pb-24 sm:pb-6">{children}</main>

      <nav className="fixed inset-x-0 bottom-0 z-10 border-t border-neutral-200 bg-white pb-[env(safe-area-inset-bottom)] sm:hidden">
        <ul className="flex">
          {TABS.map((tab) => (
            <li key={tab.href} className="flex-1">
              <Link
                href={tab.href}
                className="flex min-h-[56px] flex-col items-center justify-center text-xs"
              >
                {tab.label}
              </Link>
            </li>
          ))}
        </ul>
      </nav>
    </div>
  );
}
```

Create `src/app/admin/layout.tsx`. This layout is the enforcement point for the
whole admin area — it runs on the Node runtime before any admin page renders.

```tsx
import { AdminShell } from "@/components/AdminShell";
import { requireAdminOrRedirect } from "@/lib/authz";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  await requireAdminOrRedirect();
  return <AdminShell>{children}</AdminShell>;
}
```

- [ ] **Step 7: Verify the display helpers still behave**

Create `tests/lib/money-display.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { formatPaise } from "@/lib/money";

describe("ledger display", () => {
  it("formats a bigint ledger total", () => {
    expect(formatPaise(123456700n)).toBe("₹12,34,567.00");
  });
});
```

Run: `npm test -- money-display`
Expected: PASS.

- [ ] **Step 8: Check the app compiles**

Run: `npm run build`
Expected: build succeeds with no type errors.

- [ ] **Step 9: Commit**

```bash
git add -A
git commit -m "feat: add mobile-first UI primitives and admin shell"
```

---

### Task 12: Admin contributors pages

**Files:**
- Create: `src/app/admin/contributors/page.tsx`, `src/app/admin/contributors/actions.ts`, `src/app/admin/contributors/ContributorForm.tsx`, `src/app/admin/contributors/[id]/page.tsx`
- Test: `tests/actions/contributors.test.ts`

**Interfaces:**
- Consumes: `listContributors`, `createContributor`, `updateContributor`, `getContributor`, `requireAdmin`
- Produces: server actions `saveContributorAction(prevState, formData): Promise<ActionState>` where `type ActionState = { error?: string; ok?: boolean }`

- [ ] **Step 1: Write the failing action tests**

Create `tests/actions/contributors.test.ts`. These prove the spec's rule that every action re-checks the role itself.

```ts
import { beforeEach, describe, expect, it, vi } from "vitest";

const requireAdminMock = vi.fn();
vi.mock("@/lib/authz", async () => {
  const actual = await vi.importActual<typeof import("@/lib/authz")>("@/lib/authz");
  return { ...actual, requireAdmin: requireAdminMock };
});
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

const { prisma } = await import("@/lib/db");
const { ForbiddenError } = await import("@/lib/authz");
const { saveContributorAction } = await import("@/app/admin/contributors/actions");

function form(fields: Record<string, string>) {
  const data = new FormData();
  for (const [key, value] of Object.entries(fields)) data.set(key, value);
  return data;
}

describe("saveContributorAction", () => {
  beforeEach(() => {
    requireAdminMock.mockReset();
    requireAdminMock.mockResolvedValue({ id: "admin1", email: "boss@example.com", role: "ADMIN" });
  });

  it("creates a contributor for an admin", async () => {
    const result = await saveContributorAction({}, form({ name: "Asha", email: "asha@example.com" }));

    expect(result.ok).toBe(true);
    expect(await prisma.contributor.count({ where: { name: "Asha" } })).toBe(1);
  });

  it("refuses a non-admin and writes nothing", async () => {
    requireAdminMock.mockRejectedValue(new ForbiddenError());

    const result = await saveContributorAction({}, form({ name: "Sneaky" }));

    expect(result.error).toBeTruthy();
    expect(await prisma.contributor.count({ where: { name: "Sneaky" } })).toBe(0);
  });

  it("returns a readable error for a missing name rather than throwing", async () => {
    const result = await saveContributorAction({}, form({ name: "" }));
    expect(result.error).toMatch(/name/i);
  });

  it("updates when an id is supplied", async () => {
    const created = await prisma.contributor.create({ data: { name: "Asha" } });
    const result = await saveContributorAction({}, form({ id: created.id, name: "Asha Nair" }));

    expect(result.ok).toBe(true);
    const after = await prisma.contributor.findUnique({ where: { id: created.id } });
    expect(after?.name).toBe("Asha Nair");
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npm test -- actions/contributors`
Expected: FAIL — cannot resolve the actions module.

- [ ] **Step 3: Implement the server action**

Create `src/app/admin/contributors/actions.ts`:

```ts
"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireAdmin } from "@/lib/authz";
import { createContributor, updateContributor } from "@/lib/data/contributors";

export type ActionState = { error?: string; ok?: boolean };

function field(data: FormData, name: string): string | null {
  const value = data.get(name);
  if (typeof value !== "string") return null;
  return value.trim() === "" ? null : value.trim();
}

export async function saveContributorAction(
  _prev: ActionState,
  data: FormData,
): Promise<ActionState> {
  let actor;
  try {
    actor = await requireAdmin();
  } catch {
    return { error: "You do not have permission to do this." };
  }

  const input = {
    name: field(data, "name") ?? "",
    email: field(data, "email"),
    phone: field(data, "phone"),
    pan: field(data, "pan"),
    addressLine: field(data, "addressLine"),
    city: field(data, "city"),
    state: field(data, "state"),
    pincode: field(data, "pincode"),
    notes: field(data, "notes"),
  };

  const id = field(data, "id");

  try {
    if (id) await updateContributor(id, input, actor.id);
    else await createContributor(input, actor.id);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return { error: error.issues[0]?.message ?? "Please check the details entered." };
    }
    return { error: error instanceof Error ? error.message : "Could not save." };
  }

  revalidatePath("/admin/contributors");
  return { ok: true };
}
```

- [ ] **Step 4: Run to verify the tests pass**

Run: `npm test -- actions/contributors`
Expected: PASS, 4 tests.

- [ ] **Step 5: Build the form component**

Create `src/app/admin/contributors/ContributorForm.tsx`:

```tsx
"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/Button";
import { Field, inputClass } from "@/components/ui/Field";
import { saveContributorAction, type ActionState } from "./actions";

type Contributor = {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  pan: string | null;
  addressLine: string | null;
  city: string | null;
  state: string | null;
  pincode: string | null;
};

export function ContributorForm({ contributor }: { contributor?: Contributor }) {
  const [state, formAction, pending] = useActionState<ActionState, FormData>(
    saveContributorAction,
    {},
  );

  return (
    <form action={formAction} className="flex flex-col gap-4">
      {contributor ? <input type="hidden" name="id" value={contributor.id} /> : null}

      <Field label="Name" htmlFor="name">
        <input id="name" name="name" required defaultValue={contributor?.name} className={inputClass} />
      </Field>

      <Field label="Email (used to link their login)" htmlFor="email">
        <input id="email" name="email" type="email" inputMode="email" defaultValue={contributor?.email ?? ""} className={inputClass} />
      </Field>

      <Field label="Phone" htmlFor="phone">
        <input id="phone" name="phone" type="tel" inputMode="tel" defaultValue={contributor?.phone ?? ""} className={inputClass} />
      </Field>

      <details className="rounded-lg border border-neutral-200 bg-white p-4">
        <summary className="cursor-pointer text-sm font-medium">
          Tax details (needed later for 80G)
        </summary>
        <div className="flex flex-col gap-4 pt-4">
          <Field label="PAN" htmlFor="pan">
            <input id="pan" name="pan" defaultValue={contributor?.pan ?? ""} className={`${inputClass} uppercase`} />
          </Field>
          <Field label="Address" htmlFor="addressLine">
            <input id="addressLine" name="addressLine" defaultValue={contributor?.addressLine ?? ""} className={inputClass} />
          </Field>
          <div className="grid grid-cols-2 gap-4">
            <Field label="City" htmlFor="city">
              <input id="city" name="city" defaultValue={contributor?.city ?? ""} className={inputClass} />
            </Field>
            <Field label="PIN code" htmlFor="pincode">
              <input id="pincode" name="pincode" inputMode="numeric" defaultValue={contributor?.pincode ?? ""} className={inputClass} />
            </Field>
          </div>
        </div>
      </details>

      {state.error ? <p className="text-sm text-red-600">{state.error}</p> : null}
      {state.ok ? <p className="text-sm text-green-700">Saved.</p> : null}

      <Button type="submit" disabled={pending} className="w-full sm:w-auto">
        {pending ? "Saving…" : "Save"}
      </Button>
    </form>
  );
}
```

Tax fields sit inside a collapsed `<details>` so the common case — name and phone — stays a short form on a phone, exactly as the spec's mobile requirement demands.

- [ ] **Step 6: Build the list and edit pages**

Create `src/app/admin/contributors/page.tsx`:

```tsx
import Link from "next/link";
import { RecordList } from "@/components/RecordList";
import { listContributors } from "@/lib/data/contributors";
import { ContributorForm } from "./ContributorForm";

export default async function ContributorsPage() {
  const contributors = await listContributors();

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-xl font-semibold">People</h1>

      <RecordList
        items={contributors}
        empty="No one added yet."
        columns={[
          { key: "name", header: "Name", cell: (c) => <Link href={`/admin/contributors/${c.id}`}>{c.name}</Link> },
          { key: "email", header: "Email", cell: (c) => c.email ?? "—" },
          { key: "phone", header: "Phone", cell: (c) => c.phone ?? "—" },
        ]}
        renderCard={(c) => (
          <Link href={`/admin/contributors/${c.id}`} className="flex flex-col gap-1">
            <span className="font-medium">{c.name}</span>
            <span className="text-sm text-neutral-500">{c.email ?? c.phone ?? "No contact"}</span>
          </Link>
        )}
      />

      <section className="rounded-lg border border-neutral-200 bg-white p-4">
        <h2 className="pb-4 font-medium">Add someone</h2>
        <ContributorForm />
      </section>
    </div>
  );
}
```

Create `src/app/admin/contributors/[id]/page.tsx`:

```tsx
import { notFound } from "next/navigation";
import { getContributor } from "@/lib/data/contributors";
import { ContributorForm } from "../ContributorForm";

export default async function EditContributorPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const contributor = await getContributor(id);
  if (!contributor || contributor.isSystem) notFound();

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-xl font-semibold">{contributor.name}</h1>
      <ContributorForm contributor={contributor} />
    </div>
  );
}
```

- [ ] **Step 7: Verify in the browser at phone width**

Run `npm run dev`, open `/admin/contributors` in DevTools device mode at 360 px. Confirm: the list renders as cards, no horizontal scrolling, the Save button spans the width, and the bottom tab bar does not cover the form.

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "feat: add admin contributor list and form"
```

---

### Task 13: Admin contributions pages

**Files:**
- Create: `src/app/admin/contributions/page.tsx`, `src/app/admin/contributions/actions.ts`, `src/app/admin/contributions/ContributionForm.tsx`, `src/app/admin/page.tsx`
- Test: `tests/actions/contributions.test.ts`

**Interfaces:**
- Consumes: `createContribution`, `voidContribution`, `listContributions`, `ledgerTotals`, `listContributors`, `parseRupeesToPaise`, `requireAdmin`
- Produces: server actions `addContributionAction(prevState, formData): Promise<ActionState>` and `voidContributionAction(formData): Promise<void>`

- [ ] **Step 1: Write the failing action tests**

Create `tests/actions/contributions.test.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from "vitest";

const requireAdminMock = vi.fn();
vi.mock("@/lib/authz", async () => {
  const actual = await vi.importActual<typeof import("@/lib/authz")>("@/lib/authz");
  return { ...actual, requireAdmin: requireAdminMock };
});
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

const { prisma } = await import("@/lib/db");
const { ForbiddenError } = await import("@/lib/authz");
const { addContributionAction } = await import("@/app/admin/contributions/actions");

function form(fields: Record<string, string>) {
  const data = new FormData();
  for (const [key, value] of Object.entries(fields)) data.set(key, value);
  return data;
}

describe("addContributionAction", () => {
  beforeEach(() => {
    requireAdminMock.mockReset();
    requireAdminMock.mockResolvedValue({ id: "admin1", email: "boss@example.com", role: "ADMIN" });
  });

  it("converts the typed rupee amount to paise", async () => {
    const contributor = await prisma.contributor.create({ data: { name: "Asha" } });

    const result = await addContributionAction(
      {},
      form({
        contributorId: contributor.id,
        amount: "2,500.50",
        receivedOn: "2026-08-28",
        mode: "UPI",
      }),
    );

    expect(result.ok).toBe(true);
    const saved = await prisma.contribution.findFirst();
    expect(saved?.amountPaise).toBe(250050);
    expect(saved?.receivedOn.toISOString()).toBe("2026-08-28T00:00:00.000Z");
    expect(saved?.receiptNo).toBe("HH/2026-27/0001");
  });

  it("rejects a non-admin and writes nothing", async () => {
    requireAdminMock.mockRejectedValue(new ForbiddenError());
    const contributor = await prisma.contributor.create({ data: { name: "Asha" } });

    const result = await addContributionAction(
      {},
      form({ contributorId: contributor.id, amount: "100", receivedOn: "2026-08-28", mode: "CASH" }),
    );

    expect(result.error).toBeTruthy();
    expect(await prisma.contribution.count()).toBe(0);
  });

  it("returns a readable error for a bad amount", async () => {
    const contributor = await prisma.contributor.create({ data: { name: "Asha" } });

    const result = await addContributionAction(
      {},
      form({ contributorId: contributor.id, amount: "abc", receivedOn: "2026-08-28", mode: "CASH" }),
    );

    expect(result.error).toMatch(/amount/i);
    expect(await prisma.contribution.count()).toBe(0);
  });

  it("rejects a missing date", async () => {
    const contributor = await prisma.contributor.create({ data: { name: "Asha" } });

    const result = await addContributionAction(
      {},
      form({ contributorId: contributor.id, amount: "100", receivedOn: "", mode: "CASH" }),
    );

    expect(result.error).toMatch(/date/i);
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npm test -- actions/contributions`
Expected: FAIL — cannot resolve the actions module.

- [ ] **Step 3: Implement the server actions**

Create `src/app/admin/contributions/actions.ts`:

```ts
"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/authz";
import { createContribution, voidContribution } from "@/lib/data/contributions";
import { toDateOnly } from "@/lib/fy";
import { InvalidAmountError, parseRupeesToPaise } from "@/lib/money";

export type ActionState = { error?: string; ok?: boolean };

const MODES = ["UPI", "CASH", "BANK", "CHEQUE", "OTHER"] as const;
type Mode = (typeof MODES)[number];

export async function addContributionAction(
  _prev: ActionState,
  data: FormData,
): Promise<ActionState> {
  let actor;
  try {
    actor = await requireAdmin();
  } catch {
    return { error: "You do not have permission to do this." };
  }

  const contributorId = String(data.get("contributorId") ?? "").trim();
  if (!contributorId) return { error: "Choose who this came from." };

  const receivedOnRaw = String(data.get("receivedOn") ?? "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(receivedOnRaw)) return { error: "Enter the date received." };

  const modeRaw = String(data.get("mode") ?? "");
  const mode = (MODES as readonly string[]).includes(modeRaw) ? (modeRaw as Mode) : null;
  if (!mode) return { error: "Choose how the money was received." };

  let amountPaise: number;
  try {
    amountPaise = parseRupeesToPaise(String(data.get("amount") ?? ""));
  } catch (error) {
    if (error instanceof InvalidAmountError) return { error: "Enter a valid amount, such as 2500." };
    throw error;
  }

  try {
    await createContribution(
      {
        contributorId,
        amountPaise,
        receivedOn: toDateOnly(receivedOnRaw),
        mode,
        reference: (String(data.get("reference") ?? "").trim() || null) as string | null,
        note: (String(data.get("note") ?? "").trim() || null) as string | null,
      },
      actor.id,
    );
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Could not save." };
  }

  revalidatePath("/admin/contributions");
  revalidatePath("/admin");
  return { ok: true };
}

export async function voidContributionAction(data: FormData): Promise<void> {
  const actor = await requireAdmin();
  const id = String(data.get("id") ?? "");
  if (id) await voidContribution(id, actor.id);
  revalidatePath("/admin/contributions");
  revalidatePath("/admin");
}
```

- [ ] **Step 4: Run to verify the tests pass**

Run: `npm test -- actions/contributions`
Expected: PASS, 4 tests.

- [ ] **Step 5: Build the contribution form**

Create `src/app/admin/contributions/ContributionForm.tsx`:

```tsx
"use client";

import { useActionState } from "react";
import { AmountInput } from "@/components/ui/AmountInput";
import { Button } from "@/components/ui/Button";
import { Field, inputClass } from "@/components/ui/Field";
import { addContributionAction, type ActionState } from "./actions";

export function ContributionForm({
  contributors,
  today,
}: {
  contributors: { id: string; name: string }[];
  today: string;
}) {
  const [state, formAction, pending] = useActionState<ActionState, FormData>(
    addContributionAction,
    {},
  );

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <Field label="From" htmlFor="contributorId">
        <select id="contributorId" name="contributorId" required className={inputClass}>
          {contributors.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
          <option value="anonymous">Anonymous</option>
        </select>
      </Field>

      <AmountInput />

      <Field label="Received on" htmlFor="receivedOn">
        <input id="receivedOn" name="receivedOn" type="date" required defaultValue={today} className={inputClass} />
      </Field>

      <Field label="How" htmlFor="mode">
        <select id="mode" name="mode" required defaultValue="UPI" className={inputClass}>
          <option value="UPI">UPI</option>
          <option value="CASH">Cash</option>
          <option value="BANK">Bank transfer</option>
          <option value="CHEQUE">Cheque</option>
          <option value="OTHER">Other</option>
        </select>
      </Field>

      <Field label="Reference (UTR / cheque no.)" htmlFor="reference">
        <input id="reference" name="reference" className={inputClass} />
      </Field>

      {state.error ? <p className="text-sm text-red-600">{state.error}</p> : null}
      {state.ok ? <p className="text-sm text-green-700">Recorded.</p> : null}

      <Button type="submit" disabled={pending} className="w-full sm:w-auto">
        {pending ? "Saving…" : "Record contribution"}
      </Button>
    </form>
  );
}
```

- [ ] **Step 6: Build the contributions page and dashboard**

Create `src/app/admin/contributions/page.tsx`:

```tsx
import { RecordList } from "@/components/RecordList";
import { Money } from "@/components/ui/Money";
import { listContributions } from "@/lib/data/contributions";
import { listContributors } from "@/lib/data/contributors";
import { ContributionForm } from "./ContributionForm";
import { voidContributionAction } from "./actions";

function formatDate(value: Date) {
  return value.toISOString().slice(0, 10).split("-").reverse().join("/");
}

export default async function ContributionsPage() {
  const [contributions, contributors] = await Promise.all([
    listContributions(),
    listContributors(),
  ]);
  const today = new Date().toISOString().slice(0, 10);

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-xl font-semibold">Money in</h1>

      <section className="rounded-lg border border-neutral-200 bg-white p-4">
        <h2 className="pb-4 font-medium">Record a contribution</h2>
        <ContributionForm contributors={contributors} today={today} />
      </section>

      <RecordList
        items={contributions}
        empty="No contributions recorded yet."
        columns={[
          { key: "date", header: "Date", cell: (c) => formatDate(c.receivedOn) },
          { key: "from", header: "From", cell: (c) => c.contributor.name },
          { key: "amount", header: "Amount", cell: (c) => <Money paise={c.amountPaise} compact /> },
          { key: "receipt", header: "Receipt", cell: (c) => c.receiptNo ?? "—" },
          {
            key: "status",
            header: "",
            cell: (c) =>
              c.status === "VOID" ? (
                <span className="text-xs text-red-600">Voided</span>
              ) : (
                <form action={voidContributionAction}>
                  <input type="hidden" name="id" value={c.id} />
                  <button className="text-xs text-neutral-500 underline">Void</button>
                </form>
              ),
          },
        ]}
        renderCard={(c) => (
          <div className="flex flex-col gap-1">
            <div className="flex items-baseline justify-between">
              <span className="font-medium">{c.contributor.name}</span>
              <Money paise={c.amountPaise} compact />
            </div>
            <span className="text-sm text-neutral-500">
              {formatDate(c.receivedOn)} · {c.mode}
              {c.status === "VOID" ? " · Voided" : ""}
            </span>
            <span className="text-xs text-neutral-400">{c.receiptNo ?? ""}</span>
          </div>
        )}
      />
    </div>
  );
}
```

Create `src/app/admin/page.tsx`:

```tsx
import { Money } from "@/components/ui/Money";
import { ledgerTotals } from "@/lib/data/contributions";

export default async function AdminDashboard() {
  const totals = await ledgerTotals();

  const cards = [
    { label: "Collected", value: totals.collectedPaise },
    { label: "Given out", value: totals.disbursedPaise },
    { label: "In hand", value: totals.balancePaise },
  ];

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-xl font-semibold">Overview</h1>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        {cards.map((card) => (
          <div key={card.label} className="rounded-lg border border-neutral-200 bg-white p-4">
            <p className="text-sm text-neutral-500">{card.label}</p>
            <p className="pt-1 text-2xl font-semibold">
              <Money paise={card.value} compact />
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 7: Run the full suite and build**

Run: `npm test`
Expected: PASS, entire suite.

Run: `npm run build`
Expected: success, no type errors.

- [ ] **Step 8: Verify the whole flow by hand at 360 px**

Run `npm run dev`. Sign in as the admin. Add a contributor, record a ₹2,500.50 contribution, confirm it appears in the list with receipt `HH/2026-27/0001` and that the dashboard "Collected" total matches. Void it and confirm the total drops to ₹0 while the row remains visible as Voided.

- [ ] **Step 9: Commit**

```bash
git add -A
git commit -m "feat: add admin contributions recording, listing, and dashboard totals"
```

---

## What plan 1 delivers

An admin can sign in with Google, add the people who give money, record contributions in rupees that are stored as exact paise, see running totals, and void a mistake without destroying the record. Every change is audited and every receipt number is unique and correctly year-scoped.

## Coming in later plans

**Plan 2 — Cases, files & public transparency:** the `Case` and `Disbursement` admin screens, the storage module and authenticated `/api/files/[id]` route, the public home page and case detail with the anonymisation rule enforced by test, and the `/me` member portal.

**Plan 3 — Receipts, settings, export & deployment:** the PDF acknowledgement with the 80G switch, `/admin/settings` and `/admin/users`, Excel export, the Playwright end-to-end suite, and the production Dockerfile, Caddy configuration, nightly `pg_dump` backups and droplet deployment guide.
