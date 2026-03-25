import type { UserRole, UserStatus } from "@/generated/prisma/client";

// Extend NextAuth session
declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      name?: string | null;
      email?: string | null;
      image?: string | null;
      role: UserRole;
      status: UserStatus;
      discordId: string;
    };
  }
}

// Status badge variants
export type StatusVariant =
  | "pending"
  | "approved"
  | "rejected"
  | "flagged"
  | "archived"
  | "active"
  | "paused"
  | "draft"
  | "completed"
  | "requested"
  | "under_review"
  | "paid"
  | "verified";
