import { withSentryConfig } from "@sentry/nextjs";
import type { NextConfig } from "next";

// Content-Security-Policy directive list. Deployed as Report-Only first so
// real traffic surfaces violations without breaking pages. Once we have
// 1–2 weeks of clean reports we'll flip the header name to
// `Content-Security-Policy` to enforce. See the headers() entry below.
//
// Allowlists, by integration:
// - Stripe.js                 js.stripe.com, m.stripe.network, api.stripe.com
// - Cloudflare Turnstile      challenges.cloudflare.com
// - Google Maps JS + tiles    maps.googleapis.com, maps.gstatic.com,
//                             *.googleapis.com, *.gstatic.com
// - Sentry ingest (tunneled)  /monitoring (same-origin, set in next.config)
// - Supabase REST + storage   *.supabase.co, *.supabase.in
// - RevenueCat                api.revenuecat.com
//
// Public lead form (snapquote.us/[slug]) loads customer photos from
// Supabase Storage — img-src must allow https: + data: so embedded thumbs
// and base64 placeholders both work.
const cspDirectives = [
  "default-src 'self'",
  // Next.js inline runtime + Turnstile + Stripe.js need 'unsafe-inline' and
  // 'unsafe-eval' until we can move to nonce-based CSP. Acceptable for
  // Report-Only baseline; revisit when flipping to enforce.
  "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://js.stripe.com https://m.stripe.network https://challenges.cloudflare.com https://maps.googleapis.com https://maps.gstatic.com",
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "font-src 'self' data: https://fonts.gstatic.com",
  "img-src 'self' data: blob: https:",
  "connect-src 'self' https://*.supabase.co wss://*.supabase.co https://api.stripe.com https://maps.googleapis.com https://*.googleapis.com https://api.revenuecat.com https://challenges.cloudflare.com https://o*.ingest.sentry.io https://o*.ingest.us.sentry.io",
  "frame-src 'self' https://js.stripe.com https://hooks.stripe.com https://challenges.cloudflare.com",
  "media-src 'self' blob: https://*.supabase.co",
  "worker-src 'self' blob:",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
  "upgrade-insecure-requests"
].join("; ");

// Disable browser features the app doesn't use. camera/microphone/geolocation
// are not requested by any page; payment is left enabled because Stripe
// Elements iframes use the Payment Request API.
const permissionsPolicy = [
  "camera=()",
  "microphone=()",
  "geolocation=()",
  "interest-cohort=()",
  "browsing-topics=()",
  "accelerometer=()",
  "gyroscope=()",
  "magnetometer=()",
  "usb=()",
  "payment=(self \"https://js.stripe.com\")"
].join(", ");

const securityHeaders = [
  {
    key: "Strict-Transport-Security",
    value: "max-age=63072000; includeSubDomains; preload"
  },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: permissionsPolicy },
  // TODO(audit-8 H4): switch the header name to `Content-Security-Policy` to
  // ENFORCE after observing report-only violations for 1–2 weeks of real
  // traffic. The directive list above already covers the integrations we
  // know about (Stripe, Turnstile, Google Maps, Supabase, RevenueCat,
  // Sentry tunnel). Anything new we add (analytics, embeds, etc.) needs an
  // allowlist update before flipping.
  { key: "Content-Security-Policy-Report-Only", value: cspDirectives }
];

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
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: securityHeaders
      }
    ];
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
