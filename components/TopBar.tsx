"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { Bell, CircleUser, LogOut, Menu } from "lucide-react";
import { BrandLogo } from "@/components/BrandLogo";
import { NotificationsFeed } from "@/components/NotificationsFeed";
import { Button } from "@/components/ui/button";
import { useNotifications } from "@/hooks/useNotifications";
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
  const [mobilePopoverOpen, setMobilePopoverOpen] = useState(false);
  const mobilePopoverRef = useRef<HTMLDivElement | null>(null);
  const { feed, unreadCount, dismissNotification } = useNotifications(orgId);
  const pageTitle = getPageTitle(pathname);

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

  const startNotificationTimer = useCallback(() => {
    clearNotificationTimer();
    notificationTimerRef.current = window.setTimeout(() => {
      setDesktopNotificationsOpen(false);
      notificationTimerRef.current = null;
    }, 5000);
  }, [clearNotificationTimer]);

  // Start timer when dropdown opens, clean up when it closes
  useEffect(() => {
    if (desktopNotificationsOpen) {
      startNotificationTimer();
    } else {
      clearNotificationTimer();
    }
    return clearNotificationTimer;
  }, [desktopNotificationsOpen, startNotificationTimer, clearNotificationTimer]);

  const notificationButtonClassName =
    "inline-flex h-11 w-11 items-center justify-center rounded-[10px] border border-[#E5E7EB] bg-white text-[#6B7280] transition-colors hover:bg-[#F8F9FC] hover:text-[#111827] md:h-10 md:w-10";
  const notificationPanelClassName =
    "absolute right-0 z-30 mt-2 w-72 max-w-[calc(100vw-2rem)] rounded-[14px] border border-[#E5E7EB] bg-white p-3 shadow-[0_1px_3px_rgba(0,0,0,0.06),0_4px_16px_rgba(0,0,0,0.04)]";

  const renderNotifications = () => (
    <div className="relative">
      <button
        type="button"
        className={notificationButtonClassName}
        aria-label="Notifications"
        aria-expanded={desktopNotificationsOpen}
        onClick={() => setDesktopNotificationsOpen((value) => !value)}
      >
        <Bell className="h-4 w-4" />
        {unreadCount > 0 ? (
          <span className="absolute -right-1 -top-1 rounded-full bg-[#2563EB] px-1.5 text-[10px] text-white">
            {unreadCount}
          </span>
        ) : null}
      </button>

      {desktopNotificationsOpen ? (
        <div
          ref={notificationPanelRef}
          className={notificationPanelClassName}
          onMouseEnter={clearNotificationTimer}
          onMouseLeave={startNotificationTimer}
        >
          <NotificationsFeed feed={feed} onDismiss={dismissNotification} />
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
                className="text-[#6B7280] p-1 transition-colors hover:text-[#111827]"
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
              className="text-[#6B7280] p-1 transition-colors hover:text-[#111827]"
              aria-label="Open account menu"
              aria-expanded={mobilePopoverOpen}
              onClick={() => setMobilePopoverOpen((value) => !value)}
            >
              <CircleUser className="h-5 w-5" />
            </button>

            {mobilePopoverOpen ? (
              <div className="absolute right-0 top-full z-30 mt-2 w-72 max-w-[calc(100vw-2rem)] rounded-xl border border-[#E5E7EB] bg-white p-3 shadow-lg">
                <NotificationsFeed feed={feed} onDismiss={dismissNotification} />
                <div className="my-3 border-t border-[#E5E7EB]" />
                <button
                  type="button"
                  className="inline-flex min-h-[44px] w-full items-center gap-2 rounded-[10px] px-3 text-left text-sm font-medium text-red-500 transition-colors hover:bg-[#F8F9FC] hover:text-red-600"
                  onClick={() => void onLogout()}
                >
                  <LogOut className="h-4 w-4" />
                  Sign Out
                </button>
              </div>
            ) : null}
          </div>
        </div>

        <div className="min-w-0">
          <p className="truncate text-xl font-bold text-[#111827]">{pageTitle}</p>
        </div>
      </div>

      <div className="hidden h-16 items-center justify-between gap-6 px-6 md:flex">
        <div className="min-w-0">
          <p className="text-2xl font-bold text-[#111827]">{pageTitle}</p>
        </div>

        <div className="flex items-center gap-4">
          {renderNotifications()}

          <div className="min-w-0 text-right">
            <p className="truncate text-sm font-medium text-[#111827]">
              {businessName ?? "SnapQuote"}
            </p>
            <p className="truncate text-sm text-[#6B7280]">{email ?? "Account"}</p>
          </div>

          <Button variant="outline" className="h-10 px-4" onClick={onLogout}>
            <LogOut className="mr-2 h-4 w-4" />
            Sign out
          </Button>
        </div>
      </div>
    </header>
  );
}
