export const dynamic = "force-dynamic";

export async function GET() {
  const checks = {
    AUTH_SECRET: !!process.env.AUTH_SECRET ? `SET (${process.env.AUTH_SECRET.length} chars)` : "MISSING",
    AUTH_DISCORD_ID: !!process.env.AUTH_DISCORD_ID ? `SET (${process.env.AUTH_DISCORD_ID.length} chars)` : "MISSING",
    AUTH_DISCORD_SECRET: !!process.env.AUTH_DISCORD_SECRET ? `SET (${process.env.AUTH_DISCORD_SECRET.length} chars)` : "MISSING",
    AUTH_URL: process.env.AUTH_URL || "MISSING",
    NEXTAUTH_URL: process.env.NEXTAUTH_URL || "MISSING",
    AUTH_TRUST_HOST: process.env.AUTH_TRUST_HOST || "MISSING",
    AUTH_OWNER_EMAIL: !!process.env.AUTH_OWNER_EMAIL ? "SET" : "MISSING",
    DATABASE_URL: !!process.env.DATABASE_URL ? `SET (contains pgbouncer: ${process.env.DATABASE_URL.includes("pgbouncer")})` : "MISSING",
    NODE_ENV: process.env.NODE_ENV,
  };
  return Response.json(checks);
}
