import NextAuth from "next-auth";
import Discord from "next-auth/providers/discord";
import { PrismaAdapter } from "@auth/prisma-adapter";
import { db } from "@/lib/db";

// The owner email — this account is always OWNER
const OWNER_EMAIL = "digitalzentro@gmail.com";

export const { handlers, signIn, signOut, auth } = NextAuth({
  ...(db ? { adapter: PrismaAdapter(db) } : {}),
  providers: [
    Discord({
      clientId: process.env.AUTH_DISCORD_ID!,
      clientSecret: process.env.AUTH_DISCORD_SECRET!,
      authorization: {
        params: {
          scope: "identify email",
        },
      },
    }),
  ],
  callbacks: {
    async session({ session, user }) {
      if (session.user && db) {
        session.user.id = user.id;
        try {
          const dbUser = await db.user.findUnique({
            where: { id: user.id },
            select: { role: true, status: true, discordId: true, username: true, email: true },
          });
          if (dbUser) {
            // Auto-promote owner if email matches and role isn't OWNER yet
            if (dbUser.email === OWNER_EMAIL && dbUser.role !== "OWNER") {
              await db.user.update({
                where: { id: user.id },
                data: { role: "OWNER" },
              });
              (session.user as any).role = "OWNER";
            } else {
              (session.user as any).role = dbUser.role;
            }
            (session.user as any).status = dbUser.status;
            (session.user as any).discordId = dbUser.discordId;
            if (dbUser.username && dbUser.username !== "user") {
              session.user.name = dbUser.username;
            }
          }
        } catch (err) {
          console.warn("Failed to fetch user role:", err);
          (session.user as any).role = "CLIPPER";
          (session.user as any).status = "ACTIVE";
        }
      }
      return session;
    },
  },
  events: {
    async createUser({ user }) {
      if (!db) return;
      try {
        const account = await db.account.findFirst({
          where: { userId: user.id },
        });
        const updateData: any = {
          username: user.name || `user_${Date.now().toString(36)}`,
        };
        if (account) {
          updateData.discordId = account.providerAccountId;
        }
        // Auto-set OWNER role on first creation if email matches
        if (user.email === OWNER_EMAIL) {
          updateData.role = "OWNER";
        }
        await db.user.update({
          where: { id: user.id },
          data: updateData,
        });
      } catch (err) {
        console.warn("Failed to update user on create:", err);
      }
    },
  },
  pages: {
    signIn: "/login",
  },
});
