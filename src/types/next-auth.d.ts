import type { Role } from "@prisma/client";
import type { DefaultSession } from "next-auth";

declare module "next-auth" {
  interface Session {
    user: { id: string; role: Role } & DefaultSession["user"];
  }
}

// The `session` callback's `user` argument is typed as `AdapterUser` (from
// @auth/core/adapters) under the "database" session strategy, not as the
// `next-auth`-augmented `User`/`Session["user"]` above. Without this,
// `user.role` in src/lib/auth.ts's `session` callback fails to type-check
// because `AdapterUser` has no `role` property.
declare module "@auth/core/adapters" {
  interface AdapterUser {
    role: Role;
  }
}
