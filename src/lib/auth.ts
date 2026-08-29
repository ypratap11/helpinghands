import NextAuth from "next-auth";
import Google from "next-auth/providers/google";
import { PrismaAdapter } from "@auth/prisma-adapter";
import { prisma } from "@/lib/db";
import { linkContributorToUser, resolveRoleForEmail } from "@/lib/auth-roles";

export { linkContributorToUser, resolveRoleForEmail };

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
      session.user.role = user.role;
      return session;
    },
  },
});
