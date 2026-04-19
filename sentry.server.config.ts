import * as Sentry from "@sentry/nextjs";

// Initialized once per Node.js serverless worker. Safe to import from
// everywhere via Sentry.captureException / Sentry.captureMessage after
// this file runs.
Sentry.init({
  dsn: process.env.SENTRY_DSN,

  // Low trace sample rate — we care about errors, not every request.
  tracesSampleRate: 0.05,

  // The estimator failure we debugged in April 2026 was silent because
  // the web app had no server-side error reporting. Keep console.error
  // integration on so any console.error bubbled up from catch blocks
  // (the estimator's own, rescue cron, notification failures, etc.)
  // surfaces as a Sentry event without us having to remember to wrap
  // every call site with captureException.
  integrations: [Sentry.captureConsoleIntegration({ levels: ["error"] })],

  environment: process.env.VERCEL_ENV || process.env.NODE_ENV,
  release: process.env.VERCEL_GIT_COMMIT_SHA,

  // Avoid noise in local dev: only send events when a DSN is present.
  // (The SDK also no-ops without a DSN, but this makes the intent
  // explicit and keeps dev stack traces out of production projects.)
  enabled: Boolean(process.env.SENTRY_DSN)
});
