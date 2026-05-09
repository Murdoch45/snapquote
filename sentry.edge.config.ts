import * as Sentry from "@sentry/nextjs";
import { scrubSentryEvent } from "@/lib/sentryScrub";

// Edge runtime — middleware and any routes with `runtime: "edge"`. The
// lead-submit / estimator paths run in Node so this is mostly for
// middleware.ts and future edge routes.
Sentry.init({
  dsn: process.env.SENTRY_DSN,
  tracesSampleRate: 0.05,
  environment: process.env.VERCEL_ENV || process.env.NODE_ENV,
  release: process.env.VERCEL_GIT_COMMIT_SHA,
  enabled: Boolean(process.env.SENTRY_DSN),

  // Same scrubbing policy as server config — see lib/sentryScrub.ts.
  // Audit 8 H6.
  beforeSend(event) {
    return scrubSentryEvent(event);
  },
  beforeBreadcrumb(breadcrumb) {
    if (breadcrumb.data) breadcrumb.data = scrubSentryEvent({ extra: breadcrumb.data }).extra;
    return breadcrumb;
  }
});
