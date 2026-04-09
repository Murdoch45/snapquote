"use client";

import { useEffect } from "react";

/**
 * Resets the OAuth "Redirecting..." loading state when the user returns to the
 * page after abandoning an OAuth flow.
 *
 * Several scenarios are covered, in roughly increasing order of how exotic the
 * environment is:
 *
 * 1. **BFCache restore (mobile back button).** When the user clicks an OAuth
 *    button the page navigates away. If they tap "back", mobile browsers
 *    restore the page from the back/forward cache, preserving React state
 *    including the loading flag. The `pageshow` event fires with
 *    `event.persisted === true` in this case.
 *
 * 2. **Tab/visibility return.** When the user comes back to the tab without a
 *    BFCache restore, the `visibilitychange` event fires.
 *
 * 3. **iPhone Safari sheet dismissal.** When the user dismisses the Apple Sign
 *    In sheet (or backs out of a Google redirect) on iOS Safari, the page is
 *    often *not* unloaded and BFCache is *not* involved — Safari simply fires
 *    `window.focus`. This is the most reliable signal on iOS.
 *
 * 4. **History pop.** Some browsers fire `popstate` when the user backs into
 *    the page after an OAuth redirect; treat that as a reset signal too.
 *
 * 5. **Timeout fallback.** If none of the above fire (e.g. an in-app browser
 *    that doesn't emit focus or pageshow), reset after 5 seconds. By that
 *    point any real OAuth redirect would have already unloaded the page, so
 *    if we're still here the user has clearly cancelled.
 */
export function useOAuthLoadingReset(reset: () => void) {
  useEffect(() => {
    const handlePageShow = (event: PageTransitionEvent) => {
      if (event.persisted) reset();
    };
    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") reset();
    };
    const handleFocus = () => {
      reset();
    };
    const handlePopState = () => {
      reset();
    };

    // Last-resort timeout: if a real OAuth navigation was going to happen, the
    // page would have unloaded long before this fires. If we're still mounted
    // after 5 seconds, the user has cancelled.
    const timeoutId = window.setTimeout(() => {
      reset();
    }, 5000);

    window.addEventListener("pageshow", handlePageShow);
    document.addEventListener("visibilitychange", handleVisibilityChange);
    window.addEventListener("focus", handleFocus);
    window.addEventListener("popstate", handlePopState);

    return () => {
      window.clearTimeout(timeoutId);
      window.removeEventListener("pageshow", handlePageShow);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      window.removeEventListener("focus", handleFocus);
      window.removeEventListener("popstate", handlePopState);
    };
  }, [reset]);
}
