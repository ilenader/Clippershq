// @ts-nocheck
import { PrismaClient } from "@/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const globalForPrisma = globalThis as unknown as { prisma: any };

function createPrismaClient() {
  try {
    const connectionString = process.env.DATABASE_URL;
    if (!connectionString) {
      console.warn("DATABASE_URL not set, DB unavailable");
      return null;
    }
    // SSL is REQUIRED for Supabase (both direct and Supavisor pooler). node-postgres
    // does not auto-enable SSL from a connection string unless the URL explicitly
    // contains `sslmode=require` — Prisma's old Rust engine handled this implicitly,
    // but `@prisma/adapter-pg` uses pg directly and does NOT. Without SSL the pooler
    // rejects the TLS-gated auth handshake and returns a generic "authentication
    // failed" error that LOOKS like a password problem. Forcing ssl here makes the
    // behavior independent of how DATABASE_URL happens to be formatted on the host.
    // rejectUnauthorized=false mirrors how the Supabase pooler is normally accessed
    // and avoids CA-chain issues on container hosts whose trust store differs from
    // Vercel's serverless runtime.
    const adapter = new PrismaPg({
      connectionString,
      ssl: { rejectUnauthorized: false },
      max: 10,
    });
    return new PrismaClient({ adapter });
  } catch (err) {
    console.warn("Failed to create PrismaClient:", err);
    return null;
  }
}

// Always reuse the cached client to avoid MaxClientsInSessionMode errors.
// In development, store on globalThis so hot-reload doesn't create new clients.
export const db = (globalForPrisma.prisma ||= createPrismaClient());
