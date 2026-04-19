import * as Sentry from "@sentry/nextjs";

export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    await import("./sentry.server.config");
  }
  if (process.env.NEXT_RUNTIME === "edge") {
    await import("./sentry.edge.config");
  }
}

// Required export for Next.js to route React render errors and nested
// route-segment errors into Sentry. See:
// https://docs.sentry.io/platforms/javascript/guides/nextjs/manual-setup/
export const onRequestError = Sentry.captureRequestError;
