import * as Sentry from "@sentry/nextjs";

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,

  tracesSampleRate: process.env.NODE_ENV === "production" ? 0.1 : 1.0,

  enabled:
    process.env.NODE_ENV === "production" ||
    process.env.SENTRY_FORCE_ENABLE === "true",

  environment: process.env.NODE_ENV,

  // No session replay — costs extra. No feedback widget — clutters UI.

  beforeSend(event, hint) {
    const error = hint.originalException as any;
    const message = error?.message || "";

    // Don't report expected client errors (network blips / aborted requests).
    if (message.includes("Failed to fetch")) return null;
    if (message.includes("NetworkError")) return null;
    if (message.includes("Load failed")) return null;
    if (message.includes("AbortError")) return null;

    return event;
  },
});

// Required for performance monitoring in Next.js 15+ App Router.
export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
