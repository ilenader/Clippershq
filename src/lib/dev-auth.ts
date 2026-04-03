/**
 * Dev Auth Bypass — LOCAL DEVELOPMENT ONLY
 *
 * This module provides a mock authentication system for previewing the app
 * without setting up Discord OAuth. Controlled by DEV_AUTH_BYPASS=true in .env.
 *
 * NEVER enable in production. The isDevBypassEnabled() check ensures it only
 * works when NODE_ENV !== "production" AND the env var is set.
 */

export type DevRole = "CLIPPER" | "ADMIN" | "OWNER";

export interface DevSession {
  user: {
    id: string;
    name: string;
    email: string;
    image: string | null;
    role: DevRole;
    status: "ACTIVE";
    discordId: string;
  };
}

const DEV_USERS: Record<DevRole, DevSession> = {
  CLIPPER: {
    user: {
      id: "dev-clipper-001",
      name: "Dev Clipper",
      email: "clipper@dev.local",
      image: null,
      role: "CLIPPER",
      status: "ACTIVE",
      discordId: "000000000000000001",
    },
  },
  ADMIN: {
    user: {
      id: "dev-admin-001",
      name: "Dev Admin",
      email: "admin@dev.local",
      image: null,
      role: "ADMIN",
      status: "ACTIVE",
      discordId: "000000000000000002",
    },
  },
  OWNER: {
    user: {
      id: "dev-owner-001",
      name: "Dev Owner",
      email: "owner@dev.local",
      image: null,
      role: "OWNER",
      status: "ACTIVE",
      discordId: "000000000000000003",
    },
  },
};

/** Server-side check: is bypass enabled? */
export function isDevBypassEnabled(): boolean {
  return (
    process.env.NODE_ENV !== "production" &&
    process.env.DEV_AUTH_BYPASS === "true"
  );
}

/** Client-side check: is bypass enabled? */
export function isDevBypassEnabledClient(): boolean {
  return (
    typeof window !== "undefined" &&
    process.env.NODE_ENV !== "production" &&
    process.env.NEXT_PUBLIC_DEV_AUTH_BYPASS === "true"
  );
}

/** Get mock session for a given role */
export function getDevSession(role: DevRole): DevSession {
  return DEV_USERS[role];
}

/** Cookie name used to store the dev role */
export const DEV_AUTH_COOKIE = "dev-auth-role";
