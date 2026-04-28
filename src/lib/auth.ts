import NextAuth from "next-auth";
import Discord from "next-auth/providers/discord";
import Google from "next-auth/providers/google";
import { PrismaAdapter } from "@auth/prisma-adapter";
import { db } from "@/lib/db";
import { withDbRetry } from "@/lib/db-retry";

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
  session: {
    strategy: "jwt",
    maxAge: 30 * 24 * 60 * 60,
    updateAge: 5 * 60,
  },
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
    async jwt({ token, user }) {
      // First sign-in (`user` provided by adapter). Run a fresh DB read so the
      // token starts populated with role/status/discordId — events.createUser
      // fires before this callback but its mutations are NOT reflected in the
      // `user` object passed in, so a direct lookup is required.
      if (user) {
        token.sub = user.id;
        if (db) {
          try {
            const dbUser: any = await withDbRetry(
              () => db.user.findUnique({
                where: { id: user.id! },
                select: {
                  role: true,
                  status: true,
                  discordId: true,
                  email: true,
                  username: true,
                  isDeleted: true,
                  // Phase: JWT role propagation — sessionVersion check
                  sessionVersion: true,
                },
              }),
              "auth.jwt-firstsignin",
            );
            if (dbUser) {
              if (dbUser.isDeleted || dbUser.status === "BANNED") {
                console.log(`[AUTH] First-signin rejected for ${user.id} — deleted or banned.`);
                return null as any;
              }
              if (OWNER_EMAIL && dbUser.email === OWNER_EMAIL && dbUser.role !== "OWNER") {
                await withDbRetry(
                  () => db.user.update({
                    where: { id: user.id! },
                    data: { role: "OWNER" },
                  }),
                  "auth.owner-promote",
                );
                (token as any).role = "OWNER";
              } else {
                (token as any).role = dbUser.role || "CLIPPER";
              }
              (token as any).status = dbUser.status || "ACTIVE";
              (token as any).discordId = dbUser.discordId;
              (token as any).email = dbUser.email;
              (token as any).name = dbUser.username && dbUser.username !== "user"
                ? dbUser.username
                : user.name;
              // Phase: JWT role propagation — sessionVersion check
              (token as any).sessionVersion = dbUser.sessionVersion ?? 0;
            } else {
              (token as any).role = (user as any).role || "CLIPPER";
              (token as any).status = (user as any).status || "ACTIVE";
              (token as any).discordId = (user as any).discordId;
              (token as any).email = user.email;
              (token as any).name = user.name;
              (token as any).sessionVersion = (user as any).sessionVersion ?? 0;
            }
          } catch (err: any) {
            console.warn("[AUTH-JWT-FIRSTSIGNIN-FAIL]", err?.message || err);
            (token as any).role = (user as any).role || "CLIPPER";
            (token as any).status = (user as any).status || "ACTIVE";
            (token as any).discordId = (user as any).discordId;
            (token as any).email = user.email;
            (token as any).name = user.name;
            (token as any).sessionVersion = (user as any).sessionVersion ?? 0;
          }
        } else {
          (token as any).role = (user as any).role || "CLIPPER";
          (token as any).status = (user as any).status || "ACTIVE";
          (token as any).discordId = (user as any).discordId;
          (token as any).email = user.email;
          (token as any).name = user.name;
          (token as any).sessionVersion = (user as any).sessionVersion ?? 0;
        }
        const nowSecInit = Math.floor(Date.now() / 1000);
        (token as any).lastRefreshAt = nowSecInit;
        // Phase: JWT role propagation — sessionVersion check
        (token as any).lastVersionCheckAt = nowSecInit;
        return token;
      }

      // Subsequent requests: refresh from DB at most every 5 min. Between
      // refreshes the cached token serves auth — so a brief Supabase blip no
      // longer cascades into a logout for every user (the resilience win
      // over the database session strategy this replaces).
      const REFRESH_INTERVAL_SEC = 5 * 60;
      // Phase: JWT role propagation — sessionVersion check. A 30s lightweight
      // single-column lookup catches role changes (which atomically bump
      // User.sessionVersion in /api/admin/users/[id] PATCH) within ~30s
      // instead of waiting on the 5-min full-refresh floor.
      const VERSION_CHECK_INTERVAL_SEC = 30;
      const nowSec = Math.floor(Date.now() / 1000);
      const lastRefreshAt = (token as any).lastRefreshAt as number | undefined;
      const lastVersionCheckAt = (token as any).lastVersionCheckAt as number | undefined;

      const fullRefreshDue =
        token.sub &&
        db &&
        (!lastRefreshAt || nowSec - lastRefreshAt >= REFRESH_INTERVAL_SEC);

      // Helper: do the full-fetch refresh. Used by the 5-min floor AND by
      // version-mismatch escalation. Returns the special sentinel "INVALIDATE"
      // when the token must be killed (deleted/banned/missing user).
      const doFullRefresh = async (): Promise<"OK" | "INVALIDATE" | "FAIL"> => {
        try {
          const dbUser: any = await withDbRetry(
            () => db.user.findUnique({
              where: { id: token.sub as string },
              select: {
                role: true,
                status: true,
                discordId: true,
                email: true,
                username: true,
                isDeleted: true,
                // Phase: JWT role propagation — sessionVersion check
                sessionVersion: true,
              },
            }),
            "auth.jwt-refresh",
          );

          if (!dbUser) {
            // User row deleted entirely — invalidate token.
            return "INVALIDATE";
          }
          if (dbUser.isDeleted) {
            // Soft-deleted by /admin/reset-data — propagates within
            // REFRESH_INTERVAL_SEC of the deletion.
            console.log(`[AUTH] Soft-deleted user ${token.sub} — invalidating token.`);
            return "INVALIDATE";
          }
          if (dbUser.status === "BANNED") {
            // Banned post-sign-in — propagates within REFRESH_INTERVAL_SEC.
            // signIn callback already blocks BANNED at sign-in time; this
            // closes the existing-session gap so a banned user can't keep
            // hitting authenticated routes for up to 5 min after the ban.
            console.log(`[AUTH] Banned user ${token.sub} — invalidating token.`);
            return "INVALIDATE";
          }

          if (OWNER_EMAIL && dbUser.email === OWNER_EMAIL && dbUser.role !== "OWNER") {
            await withDbRetry(
              () => db.user.update({
                where: { id: token.sub as string },
                data: { role: "OWNER" },
              }),
              "auth.owner-promote-refresh",
            );
            (token as any).role = "OWNER";
          } else {
            (token as any).role = dbUser.role;
          }
          (token as any).status = dbUser.status;
          (token as any).discordId = dbUser.discordId;
          if (dbUser.email) (token as any).email = dbUser.email;
          if (dbUser.username && dbUser.username !== "user") {
            (token as any).name = dbUser.username;
          }
          (token as any).sessionVersion = dbUser.sessionVersion ?? 0;
          (token as any).lastRefreshAt = nowSec;
          (token as any).lastVersionCheckAt = nowSec;
          return "OK";
        } catch (err: any) {
          // DB blip mid-refresh: keep stale-but-valid token. Don't bump
          // lastRefreshAt — retry on next request rather than wait 5 min.
          console.warn("[AUTH-JWT-REFRESH-FAIL]", err?.message || err);
          return "FAIL";
        }
      };

      if (fullRefreshDue) {
        const res = await doFullRefresh();
        if (res === "INVALIDATE") return null as any;
        // OK / FAIL: fall through, return token (stale-but-valid on FAIL).
      } else if (
        token.sub &&
        db &&
        (!lastVersionCheckAt || nowSec - lastVersionCheckAt >= VERSION_CHECK_INTERVAL_SEC)
      ) {
        // Phase: JWT role propagation — sessionVersion check.
        // Lightweight single-column lookup. If versions match, just bump
        // lastVersionCheckAt and keep the cached token. If they diverge, the
        // role (or other JWT-cached field) changed under us — escalate to a
        // full refresh.
        try {
          const versionRow: any = await withDbRetry(
            () => db.user.findUnique({
              where: { id: token.sub as string },
              select: { sessionVersion: true },
            }),
            "auth.jwt-version-check",
          );

          if (versionRow) {
            const dbVersion = (versionRow.sessionVersion ?? 0) as number;
            const tokenVersion = ((token as any).sessionVersion ?? 0) as number;
            if (dbVersion !== tokenVersion) {
              const res = await doFullRefresh();
              if (res === "INVALIDATE") return null as any;
              // OK / FAIL: token already updated (OK) or kept stale (FAIL).
            } else {
              (token as any).lastVersionCheckAt = nowSec;
            }
          }
          // versionRow null is treated as a transient miss — keep stale
          // token, retry next request. The 5-min full refresh will catch a
          // truly-deleted user.
        } catch (err: any) {
          // DB blip on the lightweight check: same resilience pattern as
          // the full refresh — keep stale-but-valid token, do NOT bump
          // lastVersionCheckAt so the next request retries.
          console.warn("[AUTH-JWT-VERSION-CHECK-FAIL]", err?.message || err);
        }
      }

      return token;
    },
    async session({ session, token }) {
      // Pure transformation from token → session.user. NO DB calls — refresh
      // logic lives in the jwt callback above.
      if (token && session.user) {
        (session.user as any).id = token.sub;
        (session.user as any).role = (token as any).role || "CLIPPER";
        (session.user as any).status = (token as any).status || "ACTIVE";
        (session.user as any).discordId = (token as any).discordId;
        if ((token as any).email) session.user.email = (token as any).email;
        if ((token as any).name) session.user.name = (token as any).name;
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
