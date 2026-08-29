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
