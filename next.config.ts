import type { NextConfig } from "next";
import { withSentryConfig } from "@sentry/nextjs";

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "cdn.discordapp.com",
      },
    ],
  },
};

export default withSentryConfig(nextConfig, {
  org: "clippershq",
  project: "javascript-nextjs",

  // Suppress build-time logs unless in CI.
  silent: !process.env.CI,

  // Auth token is only set in production deploys (Railway env). Local builds
  // print a warning and skip source map upload — that's expected.
  authToken: process.env.SENTRY_AUTH_TOKEN,

  // Source maps: in @sentry/nextjs v10 the old `hideSourceMaps` option was
  // removed. The new default (`sourcemaps.deleteSourcemapsAfterUpload: true`)
  // already achieves the same outcome — maps are uploaded to Sentry then
  // deleted from the public build output. No explicit option needed.

  // Tunnel Sentry requests through your own server to bypass ad blockers.
  tunnelRoute: "/monitoring",

  // Quiet down Sentry's own logger.
  disableLogger: true,

  // We're on Railway, not Vercel.
  automaticVercelMonitors: false,

  // Capture more client sources for richer stack traces.
  widenClientFileUpload: true,
});
