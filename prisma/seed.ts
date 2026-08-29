import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
const prisma = new PrismaClient({ adapter });

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
