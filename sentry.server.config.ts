import * as Sentry from "@sentry/nextjs";

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,

  // Performance monitoring — sample 10% in production to stay within free tier.
  tracesSampleRate: process.env.NODE_ENV === "production" ? 0.1 : 1.0,

  // Don't send errors during local dev unless explicitly testing.
  enabled:
    process.env.NODE_ENV === "production" ||
    process.env.SENTRY_FORCE_ENABLE === "true",

  // KEEP FALSE — we don't want to leak request headers / IPs to Sentry.
  sendDefaultPii: false,

  environment: process.env.NODE_ENV,

  // Reduce noise: filter out expected errors before they're sent.
  beforeSend(event, hint) {
    const error = hint.originalException as any;
    const message = error?.message || "";

    // Don't report expected auth errors (these are user-facing flow, not bugs).
    if (message.includes("Unauthorized") || message.includes("Forbidden")) return null;
    if (message.includes("UNAUTHENTICATED")) return null;

    // Don't report rate-limit responses.
    if (message.includes("Retry-After") || message.includes("rate limit")) return null;

    // Don't report intentional 404s.
    if (error?.statusCode === 404) return null;

    // Don't spam Sentry with the resilience layer's own retry logs.
    if (message.includes("[DB-RETRY]") || message.includes("[AUTH-JWT-REFRESH-FAIL]")) return null;

    return event;
  },
});
