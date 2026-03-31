"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { Bell, LogOut, Menu } from "lucide-react";
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
  if (pathname.startsWith("/app/plan") || pathname === "/plan") return "My Plan";
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
  const [open, setOpen] = useState(false);
  const { feed, unreadCount, dismissNotification } = useNotifications(orgId);
  const pageTitle = getPageTitle(pathname);

  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  const onLogout = async () => {
    const supabase = createClient();
    await supabase.auth.signOut();
    window.location.href = "/login";
  };

  const notificationButtonClassName =
    "inline-flex h-11 w-11 items-center justify-center rounded-[10px] border border-[#E5E7EB] bg-white text-[#6B7280] transition-colors hover:bg-[#F8F9FC] hover:text-[#111827] md:h-10 md:w-10";
  const notificationPanelClassName =
    "absolute right-0 z-30 mt-2 w-72 max-w-[calc(100vw-2rem)] rounded-[14px] border border-[#E5E7EB] bg-white p-3 shadow-[0_1px_3px_rgba(0,0,0,0.06),0_4px_16px_rgba(0,0,0,0.04)]";
  const mobileAccountLabel = businessName ?? email ?? "Account";

  const renderNotifications = () => (
    <div className="relative">
      <button
        type="button"
        className={notificationButtonClassName}
        aria-label="Notifications"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
      >
        <Bell className="h-4 w-4" />
        {unreadCount > 0 ? (
          <span className="absolute -right-1 -top-1 rounded-full bg-[#2563EB] px-1.5 text-[10px] text-white">
            {unreadCount}
          </span>
        ) : null}
      </button>

      {open ? (
        <div className={notificationPanelClassName}>
          <NotificationsFeed feed={feed} onDismiss={dismissNotification} />
        </div>
      ) : null}
    </div>
  );

  return (
    <header className="sticky top-0 z-20 border-b border-border bg-background backdrop-blur">
      <div className="space-y-3 px-4 py-3 md:hidden">
        <div className="flex items-center gap-2">
          {onOpenSidebar ? (
            <button
              type="button"
              className="text-[#6B7280] hover:text-[#111827] p-1 transition-colors"
              aria-label="Open navigation menu"
              onClick={onOpenSidebar}
            >
              <Menu className="h-5 w-5" />
            </button>
          ) : null}

          <Link href="/app" className="min-w-0">
            <BrandLogo
              size="sm"
              className="max-w-full"
              iconClassName="h-8 w-10"
              wordmarkClassName="text-lg"
            />
          </Link>
        </div>

        <div className="min-w-0">
          <p className="truncate text-xl font-bold text-[#111827]">{pageTitle}</p>
          <p className="truncate text-sm text-[#6B7280]">{mobileAccountLabel}</p>
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
