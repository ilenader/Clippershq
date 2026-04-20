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
    // NOTE on connection pooling: @prisma/adapter-pg uses node-postgres, which
    // does NOT recognize Prisma engine-style URL params (pgbouncer=true,
    // connection_limit, statement_cache_size) — those are silently ignored.
    //
    // Prisma issues prepared statements internally and Supavisor TRANSACTION
    // mode (Supabase pooler port 6543) cannot track prepared-statement state
    // across pooled backends, which surfaces as "DbHandler exited" (XX000).
    // The fix is to point DATABASE_URL at Supavisor SESSION mode (port 5432)
    // or the direct connection — NOT to add no-op URL params here.
    //
    // max=10 is deliberate: one Railway container, modest concurrency budget.
    // Do NOT lower to 1 — it serializes every DB call behind a single socket
    // and cascades timeouts under load.
    const adapter = new PrismaPg({
      connectionString,
      ssl: { rejectUnauthorized: false },
      max: 10,
      application_name: "clippershq",
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
