"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  BarChart3,
  Coins,
  CreditCard,
  FileText,
  Home,
  Link2,
  Receipt,
  Settings,
  UserCircle2,
  Users,
  X
} from "lucide-react";
import { BrandLogo } from "@/components/BrandLogo";
import { cn } from "@/lib/utils";

const navItems = [
  { href: "/app", label: "Dashboard", icon: Home, exact: true },
  { href: "/app/leads", label: "Leads", icon: FileText, tourId: "leads" },
  { href: "/app/quotes", label: "Estimates", icon: Receipt, tourId: "estimates" },
  { href: "/app/customers", label: "Customers", icon: UserCircle2 },
  { href: "/app/analytics", label: "Analytics", icon: BarChart3 },
  { href: "/app/credits", label: "Credits", icon: Coins },
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
  className
}: {
  businessName?: string | null;
  className?: string;
}) {
  return (
    <div className={cn("border-t border-[#E5E7EB] px-6 py-5", className)}>
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
    </div>
  );
}

export function Sidebar({
  businessName,
  mode = "desktop",
  open = false,
  onClose
}: SidebarProps) {
  const pathname = usePathname();

  if (mode === "mobile") {
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
            "absolute inset-y-0 left-0 flex h-full w-[85vw] max-w-[320px] flex-col border-r border-[#E5E7EB] bg-white shadow-[0_20px_60px_rgba(15,23,42,0.18)] transition-transform duration-200 ease-out",
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

          <SidebarNav pathname={pathname} onNavigate={onClose} />
          <SidebarFooter businessName={businessName} />
        </aside>
      </div>
    );
  }

  return (
    <aside className="hidden md:fixed md:inset-y-0 md:left-0 md:z-30 md:flex md:w-[220px] md:flex-col md:border-r md:border-[#E5E7EB] md:bg-white">
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
