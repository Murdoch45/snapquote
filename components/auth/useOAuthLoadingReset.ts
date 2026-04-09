"use client";

import { useEffect } from "react";

/**
 * Resets the OAuth "Redirecting..." loading state when the user returns to the
 * page after abandoning an OAuth flow.
 *
 * Two scenarios are covered:
 *
 * 1. **BFCache restore (mobile back button).** When the user clicks an OAuth
 *    button the page navigates away. If they tap "back", mobile browsers
 *    restore the page from the back/forward cache, preserving React state
 *    including the loading flag. The `pageshow` event fires with
 *    `event.persisted === true` in this case — that's our cue to reset.
 *
 * 2. **Tab/visibility return.** When the user comes back to the tab without a
 *    BFCache restore (e.g. closing an in-app browser sheet on iOS), the
 *    `visibilitychange` event fires and we reset as a safety net.
 */
export function useOAuthLoadingReset(reset: () => void) {
  useEffect(() => {
    const handlePageShow = (event: PageTransitionEvent) => {
      if (event.persisted) reset();
    };
    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") reset();
    };

    window.addEventListener("pageshow", handlePageShow);
    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => {
      window.removeEventListener("pageshow", handlePageShow);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [reset]);
}
