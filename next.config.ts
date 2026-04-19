import { withSentryConfig } from "@sentry/nextjs";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "**.supabase.co"
      },
      {
        protocol: "https",
        hostname: "maps.googleapis.com"
      }
    ]
  }
};

// Sentry build-time wrapping: source-map upload, release tagging, and
// tunnel routing. Auth token + org + project come from env so local
// builds without the token still succeed (source-map upload is silently
// skipped).
export default withSentryConfig(nextConfig, {
  silent: !process.env.CI,
  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT,
  authToken: process.env.SENTRY_AUTH_TOKEN,
  tunnelRoute: "/monitoring",
  errorHandler: (err) => {
    // eslint-disable-next-line no-console
    console.warn("Sentry build plugin error:", err);
  },
  disableLogger: true
});
