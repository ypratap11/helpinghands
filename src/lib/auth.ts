import NextAuth from "next-auth";
import Google from "next-auth/providers/google";
import { PrismaAdapter } from "@auth/prisma-adapter";
import { prisma } from "@/lib/db";
import { linkContributorToUser, resolveRoleForEmail } from "@/lib/auth-roles";

export { linkContributorToUser, resolveRoleForEmail };

// Behind HTTPS in production, Auth.js uses the __Secure- cookie prefix; in
// local dev over HTTP it does not. Match that here so the cookie name is
// correct in both environments.
const useSecureCookies = process.env.NODE_ENV === "production";
const THIRTY_DAYS = 30 * 24 * 60 * 60;

export const { handlers, auth, signIn, signOut } = NextAuth({
  adapter: PrismaAdapter(prisma),
  providers: [Google],
  // Give the session cookie an explicit 30-day lifetime. Without maxAge the
  // session cookie is a browser-session cookie that is deleted on browser
  // close, forcing a fresh login every time even though the DB session is
  // valid for 30 days.
  session: { strategy: "database", maxAge: THIRTY_DAYS },
  cookies: {
    sessionToken: {
      name: `${useSecureCookies ? "__Secure-" : ""}authjs.session-token`,
      options: {
        httpOnly: true,
        sameSite: "lax",
        path: "/",
        secure: useSecureCookies,
        maxAge: THIRTY_DAYS,
      },
    },
  },
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
