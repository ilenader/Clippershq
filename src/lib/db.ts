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

export const db = globalForPrisma.prisma || createPrismaClient();

if (process.env.NODE_ENV !== "production" && db) {
  globalForPrisma.prisma = db;
}
