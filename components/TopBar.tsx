"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Bell, CircleUser, Menu } from "lucide-react";
import { BrandLogo } from "@/components/BrandLogo";
import { NotificationsFeed } from "@/components/NotificationsFeed";
import { Button } from "@/components/ui/button";
import { type FeedItem, useNotifications } from "@/hooks/useNotifications";
import { createClient } from "@/lib/supabase/client";

function getPageTitle(pathname: string): string {
  if (pathname.startsWith("/app/analytics")) return "Analytics";
  if (pathname.startsWith("/app/leads")) return "Leads";
  if (pathname.startsWith("/app/quotes")) return "Estimates";
  if (pathname.startsWith("/app/customers")) return "Customers";
  if (pathname.startsWith("/app/plan") || pathname === "/plan") return "Plan";
  if (pathname.startsWith("/app/team")) return "Team";
  if (pathname.startsWith("/app/settings")) return "Settings";
  if (pathname.startsWith("/dashboard/my-link")) return "My Link";
  if (pathname === "/app" || pathname === "/app/") return "Dashboard";
  if (pathname.startsWith("/app/credits")) return "Credits";

  return "Dashboard";
}

export function TopBar({
  email,
  orgId,
  businessName,
  onOpenSidebar
}: {
  email?: string | null;
  orgId: string;
  businessName?: string | null;
  onOpenSidebar?: () => void;
}) {
  const pathname = usePathname();
  const [desktopNotificationsOpen, setDesktopNotificationsOpen] = useState(false);
  const [notificationVisible, setNotificationVisible] = useState(false);
  const [mobilePopoverOpen, setMobilePopoverOpen] = useState(false);
  const mobilePopoverRef = useRef<HTMLDivElement | null>(null);
  const { feed, unreadCount, markAllRead } = useNotifications(orgId);
  const router = useRouter();
  const pageTitle = getPageTitle(pathname);

  const handleNotificationClick = useCallback(
    (item: FeedItem) => {
      setDesktopNotificationsOpen(false);
      setMobilePopoverOpen(false);

      if (item.screen === "lead" && item.screenParams?.id) {
        router.push(`/app/leads/${item.screenParams.id}`);
      } else if (item.screen === "quotes") {
        router.push("/app/quotes");
      } else if (item.screen === "team") {
        router.push("/app/team");
      }
    },
    [router]
  );

  useEffect(() => {
    setDesktopNotificationsOpen(false);
    setMobilePopoverOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (!mobilePopoverOpen) return;

    const handlePointerDown = (event: MouseEvent | TouchEvent) => {
      const target = event.target;

      if (!(target instanceof Node)) return;
      if (mobilePopoverRef.current?.contains(target)) return;

      setMobilePopoverOpen(false);
    };

    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("touchstart", handlePointerDown);

    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("touchstart", handlePointerDown);
    };
  }, [mobilePopoverOpen]);

  const onLogout = async () => {
    const supabase = createClient();
    await supabase.auth.signOut();
    window.location.href = "/login";
  };

  // Auto-dismiss notification dropdown after 5 seconds of no hover
  const notificationTimerRef = useRef<number | null>(null);
  const notificationPanelRef = useRef<HTMLDivElement | null>(null);

  const clearNotificationTimer = useCallback(() => {
    if (notificationTimerRef.current !== null) {
      window.clearTimeout(notificationTimerRef.current);
      notificationTimerRef.current = null;
    }
  }, []);

  const fadeTimeoutRef = useRef<number | null>(null);

  const startNotificationTimer = useCallback(() => {
    clearNotificationTimer();
    notificationTimerRef.current = window.setTimeout(() => {
      notificationTimerRef.current = null;
      // Start fade-out: set visible to false (triggers opacity transition),
      // then remove from DOM after the transition completes.
      setNotificationVisible(false);
      fadeTimeoutRef.current = window.setTimeout(() => {
        setDesktopNotificationsOpen(false);
        fadeTimeoutRef.current = null;
      }, 300);
    }, 5000);
  }, [clearNotificationTimer]);

  // Start timer when dropdown opens, clean up when it closes
  useEffect(() => {
    if (desktopNotificationsOpen) {
      // Small delay to ensure the element is in the DOM before triggering opacity
      requestAnimationFrame(() => setNotificationVisible(true));
      startNotificationTimer();
    } else {
      setNotificationVisible(false);
      clearNotificationTimer();
      if (fadeTimeoutRef.current !== null) {
        window.clearTimeout(fadeTimeoutRef.current);
        fadeTimeoutRef.current = null;
      }
    }
    return () => {
      clearNotificationTimer();
      if (fadeTimeoutRef.current !== null) {
        window.clearTimeout(fadeTimeoutRef.current);
        fadeTimeoutRef.current = null;
      }
    };
  }, [desktopNotificationsOpen, startNotificationTimer, clearNotificationTimer]);

  const notificationButtonClassName =
    "inline-flex h-11 w-11 items-center justify-center rounded-[10px] border border-border bg-card text-muted-foreground transition-colors hover:bg-muted hover:text-foreground md:h-10 md:w-10";
  const notificationPanelClassName =
    "absolute right-0 z-30 mt-2 w-72 max-w-[calc(100vw-2rem)] rounded-[14px] border border-border bg-card p-3 shadow-[0_1px_3px_rgba(0,0,0,0.06),0_4px_16px_rgba(0,0,0,0.04)]";

  const renderNotifications = () => (
    <div className="relative">
      <button
        type="button"
        className={notificationButtonClassName}
        aria-label="Notifications"
        aria-expanded={desktopNotificationsOpen}
        onClick={() => {
          setDesktopNotificationsOpen((value) => {
            if (!value) {
              // Opening: mark as read and cancel any in-flight fade
              void markAllRead();
              if (fadeTimeoutRef.current !== null) {
                window.clearTimeout(fadeTimeoutRef.current);
                fadeTimeoutRef.current = null;
              }
            }
            return !value;
          });
        }}
      >
        <Bell className="h-4 w-4" />
        {unreadCount > 0 ? (
          <span className="absolute -right-1 -top-1 rounded-full bg-primary px-1.5 text-[10px] text-white">
            {unreadCount}
          </span>
        ) : null}
      </button>

      {desktopNotificationsOpen ? (
        <div
          ref={notificationPanelRef}
          className={notificationPanelClassName}
          style={{
            opacity: notificationVisible ? 1 : 0,
            transition: "opacity 300ms ease-out"
          }}
          onMouseEnter={() => {
            clearNotificationTimer();
            // Cancel any in-flight fade
            if (fadeTimeoutRef.current !== null) {
              window.clearTimeout(fadeTimeoutRef.current);
              fadeTimeoutRef.current = null;
            }
            setNotificationVisible(true);
          }}
          onMouseLeave={startNotificationTimer}
        >
          <NotificationsFeed feed={feed} onItemClick={handleNotificationClick} />
        </div>
      ) : null}
    </div>
  );

  return (
    <header className="sticky top-0 z-20 border-b border-border bg-background backdrop-blur">
      <div className="space-y-3 px-4 py-3 md:hidden">
        <div className="relative flex items-center justify-between">
          <div className="z-10 flex w-10 justify-start">
            {onOpenSidebar ? (
              <button
                type="button"
                className="text-muted-foreground p-1 transition-colors hover:text-foreground"
                aria-label="Open navigation menu"
                onClick={onOpenSidebar}
              >
                <Menu className="h-5 w-5" />
              </button>
            ) : null}
          </div>

          <div className="pointer-events-none absolute inset-x-0 flex justify-center">
            <Link href="/app" className="pointer-events-auto min-w-0">
              <BrandLogo
                size="sm"
                className="max-w-full"
                iconClassName="h-8 w-10"
                wordmarkClassName="text-lg"
              />
            </Link>
          </div>

          <div ref={mobilePopoverRef} className="relative z-10 flex w-10 justify-end">
            <button
              type="button"
              className="text-muted-foreground p-1 transition-colors hover:text-foreground"
              aria-label="Open account menu"
              aria-expanded={mobilePopoverOpen}
              onClick={() => {
                setMobilePopoverOpen((value) => {
                  if (!value) void markAllRead();
                  return !value;
                });
              }}
            >
              <CircleUser className="h-5 w-5" />
            </button>

            {mobilePopoverOpen ? (
              <div className="absolute right-0 top-full z-30 mt-2 w-72 max-w-[calc(100vw-2rem)] rounded-xl border border-border bg-card p-3 shadow-lg">
                <NotificationsFeed feed={feed} onItemClick={handleNotificationClick} />
                <div className="my-3 border-t border-border" />
                <button
                  type="button"
                  className="inline-flex min-h-[44px] w-full items-center justify-center rounded-[10px] bg-red-600 px-3 text-sm font-semibold text-white transition-colors hover:bg-red-700"
                  onClick={() => void onLogout()}
                >
                  Sign Out
                </button>
              </div>
            ) : null}
          </div>
        </div>

        <div className="min-w-0">
          <p className="truncate text-xl font-bold text-foreground">{pageTitle}</p>
        </div>
      </div>

      <div className="hidden h-16 items-center justify-between gap-6 px-6 md:flex">
        <div className="min-w-0">
          <p className="text-2xl font-bold text-foreground">{pageTitle}</p>
        </div>

        <div className="flex items-center gap-4">
          {renderNotifications()}

          <div className="min-w-0 text-right">
            <p className="truncate text-sm font-medium text-foreground">
              {businessName ?? "SnapQuote"}
            </p>
            <p className="truncate text-sm text-muted-foreground">{email ?? "Account"}</p>
          </div>

          <Button variant="destructive" className="h-10 px-4" onClick={onLogout}>
            Sign out
          </Button>
        </div>
      </div>
    </header>
  );
}
