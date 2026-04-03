import dotenv from "dotenv";
import path from "path";
import { defineConfig } from "prisma/config";

// Load .env first, then .env.local (which overrides .env values).
// Next.js loads .env.local automatically at runtime, but Prisma CLI does not —
// so we must load it explicitly here for `prisma migrate dev` to work.
dotenv.config({ path: path.resolve(process.cwd(), ".env") });
dotenv.config({ path: path.resolve(process.cwd(), ".env.local"), override: true });

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
  },
  datasource: {
    // Use DIRECT_URL for migrations (bypasses pgbouncer), fallback to DATABASE_URL
    url: process.env["DIRECT_URL"] || process.env["DATABASE_URL"],
  },
});
