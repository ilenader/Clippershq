/**
 * Railway native cron entrypoint.
 *
 * Railway's "Cron Schedule" setting runs a service on a schedule by invoking
 * its startCommand. This script is the startCommand for the cron service:
 * `tsx scripts/run-tracking-cron.ts`.
 *
 * Design notes:
 *  - Env is loaded FIRST via dotenv/config so dynamic imports below see the
 *    right DATABASE_URL / API keys before any module tries to read them.
 *  - `runDueTrackingJobs` is imported dynamically (after env load) using a
 *    relative path — tsx doesn't resolve TS path aliases by default, and
 *    `@/lib/tracking` would fail at runtime on Railway.
 *  - KILL_TIMEOUT is an absolute backstop. The tracking code already has its
 *    own 8-minute wall-clock deadline (trackingDeadlineAt), but a hung Apify
 *    HTTP call or a stuck DB connection could in theory block indefinitely.
 *    This timer force-exits the process so Railway schedules a fresh one.
 *  - Explicit db.$disconnect() before exit to avoid hanging Prisma pool
 *    connections that would otherwise linger for Supabase's connection-idle
 *    timeout (~60s).
 *  - Exit codes: 0 success, 1 handled error, 2 timeout kill. Railway
 *    dashboard shows each as distinct.
 */
import "dotenv/config";

const KILL_TIMEOUT = 10 * 60 * 1000; // 10 minutes — backstop only; tracking's own deadline is 8 min

const killTimer = setTimeout(() => {
  console.error(`[CRON] TIMEOUT: Process ran for ${KILL_TIMEOUT / 60_000}min, force-killing`);
  process.exit(2);
}, KILL_TIMEOUT);
// unref so this timer doesn't itself keep the event loop alive past the
// natural completion of main() — otherwise node won't exit even after
// everything finishes cleanly.
killTimer.unref();

async function main() {
  const start = Date.now();
  console.log(`[CRON] Starting tracking at ${new Date().toISOString()}`);

  try {
    const { runDueTrackingJobs } = await import("../src/lib/tracking");
    const result = await runDueTrackingJobs({ source: "cron" });

    const duration = ((Date.now() - start) / 1000).toFixed(1);
    console.log(`[CRON] Completed in ${duration}s — processed=${result.processed} errors=${result.errors}`);
    if (result.details?.length) {
      console.log(`[CRON] Details:\n  ${result.details.join("\n  ")}`);
    }
  } catch (err) {
    const duration = ((Date.now() - start) / 1000).toFixed(1);
    console.error(`[CRON] FAILED after ${duration}s`);
    console.error(err);
    await disconnectDb();
    process.exit(1);
  }

  await disconnectDb();
  process.exit(0);
}

async function disconnectDb() {
  try {
    const { db } = await import("../src/lib/db");
    if (db) await db.$disconnect();
  } catch (err) {
    console.error(`[CRON] DB disconnect failed (continuing):`, err);
  }
}

main();
