"use client";

import * as Sentry from "@sentry/nextjs";
import { useEffect } from "react";

// Next.js 15 + @sentry/nextjs v10 root-error boundary. Triggered when
// the root layout itself throws — Sentry init failure, font hook, top-
// level provider crash, anything before per-segment error.tsx boundaries
// can mount. Audit 13 H3 added this so root-layout crashes produce a
// Sentry event instead of falling through to the default Next runtime
// error page with no telemetry.
//
// Note: global-error MUST include its own <html> + <body> tags because
// it replaces the entire root layout when triggered. Keep the markup
// minimal — DOM utilities, fonts, providers all may have failed.
export default function GlobalError({
  error
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    Sentry.captureException(error, {
      tags: { segment: "root", digest: error.digest ?? "none" }
    });
  }, [error]);

  return (
    <html lang="en">
      <body>
        <div
          style={{
            minHeight: "100vh",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: "1rem",
            textAlign: "center",
            fontFamily: "system-ui, -apple-system, sans-serif"
          }}
        >
          <div style={{ maxWidth: "28rem" }}>
            <h1 style={{ fontSize: "1.25rem", fontWeight: 600, marginBottom: "0.5rem" }}>
              Something went wrong
            </h1>
            <p style={{ fontSize: "0.875rem", color: "#52525b", marginBottom: "1rem" }}>
              The page couldn&apos;t load. Try refreshing the browser, or contact support if this
              keeps happening.
            </p>
            {error.digest ? (
              <p style={{ fontSize: "0.75rem", color: "#a1a1aa" }}>
                Reference: <code style={{ fontFamily: "monospace" }}>{error.digest}</code>
              </p>
            ) : null}
          </div>
        </div>
      </body>
    </html>
  );
}
