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
    }).catch(() => {
      // Activity tracking is best-effort; never surface errors to the user.
    });
  }, []);

  return null;
}
