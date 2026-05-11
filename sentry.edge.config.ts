import * as Sentry from "@sentry/nextjs";
import { isKnownSentryNoise, scrubSentryEvent } from "@/lib/sentryScrub";

// Edge runtime — middleware and any routes with `runtime: "edge"`. The
// lead-submit / estimator paths run in Node so this is mostly for
// middleware.ts and future edge routes.
//
// Audit 13 fixes (2026-05-11):
// - M6: captureConsoleIntegration added so caught-and-logged errors in
//       edge middleware reach Sentry (parity with the Node server config).
// - H5: tracesSampleRate bumped 0.05 → 0.2.
Sentry.init({
  dsn: process.env.SENTRY_DSN,
  tracesSampleRate: 0.2,
  environment: process.env.VERCEL_ENV || process.env.NODE_ENV,
  release: process.env.VERCEL_GIT_COMMIT_SHA,
  enabled: Boolean(process.env.SENTRY_DSN),

  integrations: [Sentry.captureConsoleIntegration({ levels: ["error"] })],

  // Same scrubbing policy as server config — see lib/sentryScrub.ts.
  // Audit 8 H6 + Audit 13 M2 (DEP0169 noise filter).
  beforeSend(event) {
    if (isKnownSentryNoise(event)) return null;
    return scrubSentryEvent(event);
  },
  beforeBreadcrumb(breadcrumb) {
    if (breadcrumb.data) breadcrumb.data = scrubSentryEvent({ extra: breadcrumb.data }).extra;
    return breadcrumb;
  }
});
