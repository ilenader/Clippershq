// @ts-nocheck
/**
 * Prisma client singleton.
 *
 * IMPORTANT — DATABASE_URL must use Supabase Transaction pooler:
 *   postgresql://...pooler.supabase.com:6543/postgres?pgbouncer=true&connection_limit=1
 *
 * Session mode (port 5432) causes MaxClientsInSessionMode errors under real traffic.
 * Production outage 2026-04-24 was caused by port 5432 DATABASE_URL.
 */
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
    // CONNECTION POOLING — Transaction mode is canonical (validated in prod 2026-04-24).
    //
    // DATABASE_URL must point at Supavisor TRANSACTION mode (Supabase pooler
    // port 6543) with ?pgbouncer=true&connection_limit=1 in the query string.
    // The ?pgbouncer=true flag disables Prisma's prepared-statement caching,
    // which historically was the reason transaction mode failed ("DbHandler
    // exited" / XX000 errors). With that flag set, transaction mode is stable.
    //
    // Session mode (port 5432) is NOT a fallback — it exhausts the pool under
    // real traffic. Production outage 2026-04-24 was caused by port 5432
    // DATABASE_URL. Do not revert to session mode regardless of older notes
    // or commit history that may suggest otherwise.
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
