import * as Sentry from "@sentry/nextjs";
import { isKnownSentryNoise, scrubSentryEvent } from "@/lib/sentryScrub";

// Client-side Sentry init. Loaded by Next.js (instrumentation-client.ts is
// the v15 + Sentry v10 convention; replaces the older sentry.client.config.ts).
// Keeps the same scrubbing policy as server/edge configs so PII captured
// in the browser (form values, addresses entered into autocomplete,
// localStorage breadcrumbs, etc.) is redacted before leaving the page.
//
// Audit 13 fixes (2026-05-11):
// - H2: captureConsoleIntegration added so client-side error-boundary
//       console.error calls (6 of 7 client error.tsx files don't wrap
//       Sentry.captureException explicitly) reach Sentry.
// - H5: tracesSampleRate bumped 0.05 → 0.2; replayIntegration added with
//       replaysOnErrorSampleRate 1.0 (session sample rate stays 0 so we
//       only burn replay quota on actual errors).
Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  tracesSampleRate: 0.2,
  replaysSessionSampleRate: 0,
  replaysOnErrorSampleRate: 1.0,
  environment: process.env.NEXT_PUBLIC_VERCEL_ENV || process.env.NODE_ENV,
  release: process.env.NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA,
  enabled: Boolean(process.env.NEXT_PUBLIC_SENTRY_DSN),

  integrations: [
    Sentry.captureConsoleIntegration({ levels: ["error"] }),
    Sentry.replayIntegration({ maskAllText: true, blockAllMedia: true })
  ],

  // Audit 8 H6 — strip PII before send. See lib/sentryScrub.ts.
  // Audit 13 M2 — drop known third-party DEP0169 noise before scrubbing.
  beforeSend(event) {
    if (isKnownSentryNoise(event)) return null;
    return scrubSentryEvent(event);
  },
  beforeBreadcrumb(breadcrumb) {
    if (breadcrumb.data) breadcrumb.data = scrubSentryEvent({ extra: breadcrumb.data }).extra;
    return breadcrumb;
  }
});

export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
