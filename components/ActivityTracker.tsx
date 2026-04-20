"use client";

import { useEffect } from "react";

/**
 * Fires a single best-effort POST to /api/app/activity/touch on mount so the
 * server can stamp organizations.last_active_at. Mounted from the
 * authenticated app layout — one ping per page load is plenty, the endpoint
 * itself is rate-limited per-org.
 */
export function ActivityTracker() {
  useEffect(() => {
    fetch("/api/app/activity/touch", {
      method: "POST",
      credentials: "same-origin",
      keepalive: true
    })
      .then((response) => {
        // fetch() only rejects on network failure; a non-2xx response
        // (401, 500, etc.) still resolves. Log non-ok responses so a
        // silently broken endpoint surfaces in the browser console and
        // Sentry (captureConsoleIntegration) instead of disappearing.
        if (!response.ok) {
          console.warn(
            `Activity tracker ping returned ${response.status} ${response.statusText}`
          );
        }
      })
      .catch((error) => {
        // Best-effort — don't surface to the user, but log so genuine
        // network failures are traceable in Vercel logs and Sentry.
        console.warn("Activity tracker ping failed:", error);
      });
  }, []);

  return null;
}
