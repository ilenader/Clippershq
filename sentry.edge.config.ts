import * as Sentry from "@sentry/nextjs";

// Edge runtime is not currently used by this app, but Sentry recommends
// initializing it anyway in case middleware or edge handlers are added later.
Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  tracesSampleRate: process.env.NODE_ENV === "production" ? 0.1 : 1.0,
  enabled:
    process.env.NODE_ENV === "production" ||
    process.env.SENTRY_FORCE_ENABLE === "true",
  environment: process.env.NODE_ENV,
});
