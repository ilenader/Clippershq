import NextAuth from "next-auth";
import Discord from "next-auth/providers/discord";
import Google from "next-auth/providers/google";
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
          scope: "identify email guilds guilds.join",
        },
      },
      // Override the default NextAuth Discord provider. The default maps
      // `global_name` (the mutable display name) → user.name, which then gets
      // copied into our `username` field on signup. That means if a user changes
      // their Discord display name, the next fresh signup would store a
      // different name. Using `profile.username` (the stable, unique handle)
      // keeps usernames consistent — @ankara stays @ankara.
      profile(profile: any) {
        const format = typeof profile.avatar === "string" && profile.avatar.startsWith("a_") ? "gif" : "png";
        const image = profile.avatar
          ? `https://cdn.discordapp.com/avatars/${profile.id}/${profile.avatar}.${format}`
          : null;
        return {
          id: String(profile.id),
          name: profile.username,
          email: profile.email,
          image,
        };
      },
    }),
    ...(process.env.GOOGLE_CLIENT_ID ? [Google({
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
    })] : []),
  ],
  callbacks: {
    async signIn({ user, account, profile }) {
      // Google login: only allow for pre-existing CLIENT users
      if (account?.provider === "google" && db && user.email) {
        try {
          const existingUser = await db.user.findUnique({
            where: { email: user.email },
            select: { id: true, role: true, status: true },
          });
          if (!existingUser) return "/login?error=google-no-account";
          if (existingUser.role !== "CLIENT") return "/login?error=use-discord";
          if (existingUser.status === "BANNED") return false;

          // Manually link Google account to existing CLIENT user if not already linked
          const existingAccount = await db.account.findFirst({
            where: { userId: existingUser.id, provider: "google" },
          });
          if (!existingAccount && account.providerAccountId) {
            await db.account.create({
              data: {
                userId: existingUser.id,
                type: account.type || "oauth",
                provider: "google",
                providerAccountId: account.providerAccountId,
                access_token: account.access_token,
                refresh_token: account.refresh_token,
                expires_at: account.expires_at,
                token_type: account.token_type,
                scope: account.scope,
                id_token: account.id_token,
              },
            });
            // Point NextAuth user.id to existing user so PrismaAdapter doesn't create a duplicate
            user.id = existingUser.id;
          }
        } catch (err: any) {
          console.error("[AUTH] Google sign-in check error:", err?.message);
          return "/login?error=server-error";
        }
      }

      if (db && account?.provider === "discord" && account?.providerAccountId) {
        try {
          // Ban check via discordId
          const existing = await db.user.findFirst({
            where: { discordId: account.providerAccountId },
            select: { id: true, status: true },
          });
          if (existing?.status === "BANNED") {
            return false;
          }
        } catch (err: any) {
          console.error("[AUTH] Ban check DB error:", err?.message);
        }

        // Sync Discord username using user.id (resolved by PrismaAdapter)
        const discordUsername = (profile as any)?.username;
        if (user?.id && typeof discordUsername === "string" && discordUsername) {
          try {
            const current = await db.user.findUnique({
              where: { id: user.id },
              select: { username: true, discordId: true },
            });
            const updates: Record<string, string> = {};
            if (current && current.username !== discordUsername) {
              updates.username = discordUsername;
            }
            if (current && !current.discordId) {
              updates.discordId = account.providerAccountId;
            }
            if (Object.keys(updates).length > 0) {
              await db.user.update({ where: { id: user.id }, data: updates });
              console.log("[AUTH] Synced Discord user:", { userId: user.id, ...updates });
            }
          } catch (err: any) {
            console.error("[AUTH] Username sync error:", err?.message);
          }
        }
      }

      // Auto-join the user to the Clippers HQ Discord server
      if (process.env.DISCORD_GUILD_ID && process.env.DISCORD_BOT_TOKEN && account?.access_token && profile?.id) {
        const discordId = String(profile.id);
        const guildId = process.env.DISCORD_GUILD_ID;
        const botToken = process.env.DISCORD_BOT_TOKEN;
        const alertRoleId = process.env.DISCORD_ALERT_ROLE_ID;

        try {
          // Step 1: Add user to guild
          const joinRes = await fetch(`https://discord.com/api/v10/guilds/${guildId}/members/${discordId}`, {
            method: 'PUT',
            headers: {
              'Authorization': `Bot ${botToken}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              access_token: account.access_token,
            }),
          });
          console.log(`[DISCORD] Guild join for ${discordId}: ${joinRes.status}`);

          // Step 2: Assign alert role (only if guild join succeeded)
          if (joinRes.status === 201 || joinRes.status === 204) {
            if (!alertRoleId) {
              console.warn('[DISCORD] DISCORD_ALERT_ROLE_ID is not set — skipping role assignment');
            } else {
              // Wait 2s for Discord to finish processing the member join
              await new Promise(r => setTimeout(r, 2000));

              try {
                console.log(`[DISCORD] Assigning role ${alertRoleId} to ${discordId} in guild ${guildId}`);
                const roleRes = await fetch(`https://discord.com/api/v10/guilds/${guildId}/members/${discordId}/roles/${alertRoleId}`, {
                  method: 'PUT',
                  headers: {
                    'Authorization': `Bot ${botToken}`,
                    'Content-Type': 'application/json',
                  },
                });
                console.log(`[DISCORD] Role assignment for ${discordId}: ${roleRes.status}`);
                if (!roleRes.ok) {
                  const body = await roleRes.text();
                  // Bot needs "Manage Roles" permission and its role must be HIGHER than the assigned role in Discord hierarchy
                  console.error(`[DISCORD] Role assignment failed: ${roleRes.status} — ${body}`);
                }
              } catch (roleErr) {
                console.error('[DISCORD] Role assignment error:', roleErr);
              }
            }
          }
        } catch (err) {
          console.error('[DISCORD] Guild join error:', err);
        }
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
    async redirect({ url, baseUrl }) {
      // Allow relative paths (most NextAuth callback URLs)
      if (url.startsWith("/")) return `${baseUrl}${url}`;
      // Allow same-origin absolute URLs only (prevent https://clipershq.com.evil.com bypass)
      try {
        const parsed = new URL(url);
        const base = new URL(baseUrl);
        if (parsed.origin === base.origin) return url;
      } catch {
        // fall through
      }
      return baseUrl;
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

        // Send welcome email to new clippers
        if (user.email && updateData.role !== "OWNER") {
          try {
            const { sendWelcomeEmail } = await import("@/lib/email");
            await sendWelcomeEmail(user.email, updateData.username || "Clipper");
          } catch {}
        }

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
