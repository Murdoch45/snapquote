import * as Sentry from "@sentry/nextjs";
import { scrubSentryEvent } from "@/lib/sentryScrub";

// Client-side Sentry init. Loaded by Next.js (instrumentation-client.ts is
// the v15 + Sentry v10 convention; replaces the older sentry.client.config.ts).
// Keeps the same scrubbing policy as server/edge configs so PII captured
// in the browser (form values, addresses entered into autocomplete,
// localStorage breadcrumbs, etc.) is redacted before leaving the page.
Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  tracesSampleRate: 0.05,
  environment: process.env.NEXT_PUBLIC_VERCEL_ENV || process.env.NODE_ENV,
  release: process.env.NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA,
  enabled: Boolean(process.env.NEXT_PUBLIC_SENTRY_DSN),

  // Audit 8 H6 — strip PII before send. See lib/sentryScrub.ts.
  beforeSend(event) {
    return scrubSentryEvent(event);
  },
  beforeBreadcrumb(breadcrumb) {
    if (breadcrumb.data) breadcrumb.data = scrubSentryEvent({ extra: breadcrumb.data }).extra;
    return breadcrumb;
  }
});

export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
