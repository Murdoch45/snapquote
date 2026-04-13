"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Bell, Menu } from "lucide-react";
import { BrandLogo } from "@/components/BrandLogo";
import { NotificationsFeed } from "@/components/NotificationsFeed";
import { type FeedItem, useNotifications } from "@/hooks/useNotifications";

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
  orgId,
  onOpenSidebar
}: {
  orgId: string;
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
      setNotificationVisible(false);
      fadeTimeoutRef.current = window.setTimeout(() => {
        setDesktopNotificationsOpen(false);
        fadeTimeoutRef.current = null;
      }, 300);
    }, 5000);
  }, [clearNotificationTimer]);

  useEffect(() => {
    if (desktopNotificationsOpen) {
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
    "relative inline-flex h-11 w-11 items-center justify-center rounded-[10px] border border-border bg-card text-muted-foreground transition-colors hover:bg-muted hover:text-foreground md:h-10 md:w-10";
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
              className="relative text-muted-foreground p-1 transition-colors hover:text-foreground"
              aria-label="Notifications"
              aria-expanded={mobilePopoverOpen}
              onClick={() => {
                setMobilePopoverOpen((value) => {
                  if (!value) void markAllRead();
                  return !value;
                });
              }}
            >
              <Bell className="h-5 w-5" />
              {unreadCount > 0 ? (
                <span className="absolute -right-1 -top-1 rounded-full bg-primary px-1.5 text-[10px] text-white">
                  {unreadCount}
                </span>
              ) : null}
            </button>

            {mobilePopoverOpen ? (
              <div className="absolute right-0 top-full z-30 mt-2 w-72 max-w-[calc(100vw-2rem)] rounded-xl border border-border bg-card p-3 shadow-lg">
                <NotificationsFeed feed={feed} onItemClick={handleNotificationClick} />
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

        {renderNotifications()}
      </div>
    </header>
  );
}
