import NextAuth from "next-auth";
import Discord from "next-auth/providers/discord";
import { PrismaAdapter } from "@auth/prisma-adapter";
import { db } from "@/lib/db";

// The owner email — this account is always OWNER (must be set via env, no fallback)
const OWNER_EMAIL = process.env.AUTH_OWNER_EMAIL;

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
    async signIn({ user, account }) {
      // Block banned users from signing in
      if (db && account?.providerAccountId) {
        try {
          const existing = await db.user.findFirst({
            where: { discordId: account.providerAccountId },
            select: { status: true },
          });
          if (existing?.status === "BANNED") {
            return false; // blocks sign-in entirely
          }
        } catch {}
      }
      return true;
    },
    async session({ session, user }) {
      if (session.user) {
        session.user.id = user.id;

        // Always try to get role from DB
        if (db) {
          try {
            const dbUser = await db.user.findUnique({
              where: { id: user.id },
              select: { role: true, status: true, discordId: true, username: true, email: true },
            });
            if (dbUser) {
              // Auto-promote owner if email matches and role isn't OWNER yet
              if (OWNER_EMAIL && dbUser.email === OWNER_EMAIL && dbUser.role !== "OWNER") {
                await db.user.update({
                  where: { id: user.id },
                  data: { role: "OWNER" },
                });
                (session.user as any).role = "OWNER";
              } else {
                (session.user as any).role = dbUser.role;
              }
              (session.user as any).status = dbUser.status;
              (session.user as any).discordId = dbUser.discordId || "";
              // Ensure email is always set from DB (provider may not include it)
              if (dbUser.email) session.user.email = dbUser.email;
              if (dbUser.username && dbUser.username !== "user") {
                session.user.name = dbUser.username;
              }
            } else {
              // User not found in DB — shouldn't happen with PrismaAdapter, but handle safely
              console.warn("Session callback: user not found in DB for id:", user.id);
              (session.user as any).role = "CLIPPER";
              (session.user as any).status = "ACTIVE";
              (session.user as any).discordId = "";
            }
          } catch (err) {
            console.error("Session callback DB error (user will get CLIPPER role):", err);
            (session.user as any).role = "CLIPPER";
            (session.user as any).status = "ACTIVE";
            (session.user as any).discordId = "";
          }
        } else {
          // No DB — default to CLIPPER
          (session.user as any).role = "CLIPPER";
          (session.user as any).status = "ACTIVE";
          (session.user as any).discordId = "";
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
        if (OWNER_EMAIL && user.email === OWNER_EMAIL) {
          updateData.role = "OWNER";
        }
        await db.user.update({
          where: { id: user.id },
          data: updateData,
        });

        // Attach referral if referral_code cookie was set on login page
        try {
          if (user.id) {
            const { cookies } = await import("next/headers");
            const cookieStore = await cookies();
            const refCode = cookieStore.get("referral_code")?.value;
            if (refCode) {
              const { attachReferral } = await import("@/lib/referrals");
              await attachReferral(user.id as string, refCode);
            }
          }
        } catch {}
      } catch (err) {
        console.warn("Failed to update user on create:", err);
      }
    },
  },
  pages: {
    signIn: "/login",
  },
  trustHost: true,
  cookies: {
    pkceCodeVerifier: {
      name: "next-auth.pkce.code_verifier",
      options: {
        httpOnly: true,
        sameSite: "none",
        path: "/",
        secure: true,
      },
    },
  },
});
