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
    const adapter = new PrismaPg({ connectionString });
    return new PrismaClient({ adapter });
  } catch (err) {
    console.warn("Failed to create PrismaClient:", err);
    return null;
  }
}

// Always reuse the cached client to avoid MaxClientsInSessionMode errors.
// In development, store on globalThis so hot-reload doesn't create new clients.
export const db = (globalForPrisma.prisma ||= createPrismaClient());
