// Production seed, run by docker/entrypoint.sh on every container start.
//
// This intentionally duplicates the two upserts in prisma/seed.ts instead
// of importing it. prisma/seed.ts is a TypeScript file that imports
// "@/lib/data/contributors" via the "@/*" path alias, which needs
// tsx + the app's src/ tree to resolve at runtime. Pulling that into the
// production image just to run two idempotent upserts isn't worth the
// extra weight (tsx + esbuild) or the risk of tsconfig path resolution
// behaving differently outside `next build`/`next dev`. This plain-JS
// script only needs @prisma/client and @prisma/adapter-pg, both of which
// are already in the image because the app itself uses them.
//
// If OrgSettings' defaults or the Anonymous contributor's seed shape ever
// change, update both this file and prisma/seed.ts together.
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const ANONYMOUS_CONTRIBUTOR_ID = "anonymous";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

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
