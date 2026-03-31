"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import {
  BarChart3,
  Bell,
  CreditCard,
  FileText,
  Home,
  Link2,
  LogOut,
  Receipt,
  Settings,
  UserCircle2,
  Users,
  X
} from "lucide-react";
import { BrandLogo } from "@/components/BrandLogo";
import { NotificationsFeed } from "@/components/NotificationsFeed";
import { useNotifications } from "@/hooks/useNotifications";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";

const navItems = [
  { href: "/app", label: "Dashboard", icon: Home, exact: true },
  { href: "/app/leads", label: "Leads", icon: FileText, tourId: "leads" },
  { href: "/app/quotes", label: "Estimates", icon: Receipt, tourId: "estimates" },
  { href: "/app/customers", label: "Customers", icon: UserCircle2 },
  { href: "/app/analytics", label: "Analytics", icon: BarChart3 },
  { href: "/dashboard/my-link", label: "My Link", icon: Link2, tourId: "my-link" },
  { href: "/plan", label: "Plan", icon: CreditCard, matchPaths: ["/plan", "/app/plan"] },
  { href: "/app/team", label: "Team", icon: Users },
  { href: "/app/settings", label: "Settings", icon: Settings, tourId: "settings" }
];

function getInitials(name?: string | null): string {
  const parts = name?.trim().split(/\s+/).filter(Boolean) ?? [];
  if (parts.length === 0) return "SQ";
  return parts
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
}

type SidebarProps = {
  orgId: string;
  businessName?: string | null;
  mode?: "desktop" | "mobile";
  open?: boolean;
  onClose?: () => void;
};

function SidebarNav({
  pathname,
  onNavigate
}: {
  pathname: string;
  onNavigate?: () => void;
}) {
  return (
    <nav className="flex-1 space-y-1 overflow-y-auto px-3 pb-4">
      {navItems.map((item) => {
        const Icon = item.icon;
        const matchPaths = item.matchPaths ?? [item.href];
        const active = matchPaths.some(
          (path) => pathname === path || (!item.exact && pathname.startsWith(`${path}/`))
        );

        return (
          <Link
            key={item.href}
            href={item.href}
            data-tour-id={item.tourId}
            onClick={onNavigate}
            className={cn(
              "flex min-h-[44px] items-center gap-3 rounded-[10px] border-l-[3px] px-4 py-3 text-sm font-medium transition-colors",
              active
                ? "border-l-[#2563EB] bg-[#EFF6FF] font-semibold text-[#2563EB]"
                : "border-l-transparent text-[#6B7280] hover:bg-[#F8F9FC] hover:text-[#111827]"
            )}
          >
            <Icon className="h-4 w-4 shrink-0" />
            <span className="truncate">{item.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}

function SidebarFooter({
  businessName,
  showSignOut = false,
  onSignOut,
  signingOut = false,
  className
}: {
  businessName?: string | null;
  showSignOut?: boolean;
  onSignOut?: () => void;
  signingOut?: boolean;
  className?: string;
}) {
  return (
    <div className={cn("border-t border-border px-6 py-5", className)}>
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-[#EFF6FF] text-sm font-semibold text-[#2563EB]">
          {getInitials(businessName)}
        </div>
        <div className="min-w-0">
          <p className="truncate text-sm font-medium text-[#111827]">
            {businessName ?? "SnapQuote"}
          </p>
        </div>
      </div>

      {showSignOut ? (
        <button
          type="button"
          className="mt-4 inline-flex min-h-[44px] items-center gap-2 text-sm font-medium text-red-500 transition-colors hover:text-red-600 disabled:cursor-not-allowed disabled:opacity-60"
          onClick={onSignOut}
          disabled={signingOut}
        >
          <LogOut className="h-4 w-4" />
          {signingOut ? "Signing out..." : "Sign Out"}
        </button>
      ) : null}
    </div>
  );
}

function MobileSidebar({
  businessName,
  orgId,
  open,
  onClose
}: {
  businessName?: string | null;
  orgId: string;
  open: boolean;
  onClose?: () => void;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const { feed, unreadCount, dismissNotification } = useNotifications(orgId);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [signingOut, setSigningOut] = useState(false);

  useEffect(() => {
    if (!open) {
      setNotificationsOpen(false);
    }
  }, [open]);

  const onSignOut = async () => {
    setSigningOut(true);

    try {
      const supabase = createClient();
      await supabase.auth.signOut();
      router.push("/login");
      router.refresh();
    } finally {
      setSigningOut(false);
    }
  };

  return (
    <div
      className={cn(
        "fixed inset-0 z-40 md:hidden",
        open ? "visible pointer-events-auto" : "invisible pointer-events-none"
      )}
      aria-hidden={!open}
    >
      <button
        type="button"
        className={cn(
          "absolute inset-0 bg-[#111827]/40 transition-opacity duration-200",
          open ? "opacity-100" : "opacity-0"
        )}
        aria-label="Close navigation menu"
        onClick={onClose}
      />

      <aside
        className={cn(
          "absolute inset-y-0 left-0 flex h-full w-[85vw] max-w-[320px] flex-col border-r border-border bg-background shadow-[0_20px_60px_rgba(15,23,42,0.18)] transition-transform duration-200 ease-out",
          open ? "translate-x-0" : "-translate-x-full"
        )}
        aria-modal="true"
        role="dialog"
      >
        <div className="flex items-center justify-between gap-3 px-5 py-5">
          <Link href="/app" className="min-w-0" onClick={onClose}>
            <BrandLogo
              size="sm"
              className="max-w-full"
              iconClassName="h-8 w-10"
              wordmarkClassName="text-lg"
            />
          </Link>

          <button
            type="button"
            className="inline-flex h-11 w-11 items-center justify-center rounded-[10px] border border-[#E5E7EB] text-[#6B7280] transition-colors hover:bg-[#F8F9FC] hover:text-[#111827]"
            aria-label="Close navigation menu"
            onClick={onClose}
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-3 pb-4">
          <button
            type="button"
            onClick={() => setNotificationsOpen((current) => !current)}
            className="flex min-h-[44px] w-full items-center gap-3 rounded-[10px] border-l-[3px] border-l-transparent px-4 py-3 text-left text-sm font-medium text-[#6B7280] transition-colors hover:bg-[#F8F9FC] hover:text-[#111827]"
          >
            <span className="relative flex shrink-0">
              <Bell className="h-4 w-4" />
              {unreadCount > 0 ? (
                <span className="absolute -right-1 -top-1 h-2.5 w-2.5 rounded-full bg-[#2563EB]" />
              ) : null}
            </span>
            <span className="truncate">Notifications</span>
          </button>

          {notificationsOpen ? (
            <div className="mx-4 mt-2 rounded-[14px] border border-[#E5E7EB] bg-white p-3">
              <NotificationsFeed feed={feed} onDismiss={dismissNotification} />
            </div>
          ) : null}

          <div className="mt-2">
            <SidebarNav pathname={pathname} onNavigate={onClose} />
          </div>
        </div>

        <SidebarFooter
          businessName={businessName}
          showSignOut
          onSignOut={() => void onSignOut()}
          signingOut={signingOut}
        />
      </aside>
    </div>
  );
}

export function Sidebar({
  orgId,
  businessName,
  mode = "desktop",
  open = false,
  onClose
}: SidebarProps) {
  const pathname = usePathname();

  if (mode === "mobile") {
    return (
      <MobileSidebar businessName={businessName} orgId={orgId} open={open} onClose={onClose} />
    );
  }

  return (
    <aside className="hidden md:fixed md:inset-y-0 md:left-0 md:z-30 md:flex md:w-[220px] md:flex-col md:border-r md:border-border md:bg-background">
      <div className="flex h-full flex-col">
        <div className="px-6 py-7">
          <Link href="/app" className="inline-flex">
            <BrandLogo size="sm" />
          </Link>
        </div>

        <SidebarNav pathname={pathname} />

        <SidebarFooter businessName={businessName} className="mt-auto" />
      </div>
    </aside>
  );
}
