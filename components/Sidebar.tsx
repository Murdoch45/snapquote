"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  BarChart3,
  CreditCard,
  FileText,
  Home,
  Link2,
  Receipt,
  Settings,
  UserCircle2,
  Users
} from "lucide-react";
import { BrandLogo } from "@/components/BrandLogo";
import { cn } from "@/lib/utils";

const navItems = [
  { href: "/app", label: "Dashboard", icon: Home, exact: true },
  { href: "/app/leads", label: "Leads", icon: FileText },
  { href: "/app/quotes", label: "Quotes", icon: Receipt },
  { href: "/app/customers", label: "Customers", icon: UserCircle2 },
  { href: "/app/analytics", label: "Analytics", icon: BarChart3 },
  { href: "/dashboard/my-link", label: "My Link", icon: Link2 },
  { href: "/plan", label: "My Plan", icon: CreditCard, matchPaths: ["/plan", "/app/plan"] },
  { href: "/app/team", label: "Team", icon: Users },
  { href: "/app/settings", label: "Settings", icon: Settings }
];

function getInitials(name?: string | null): string {
  const parts = name?.trim().split(/\s+/).filter(Boolean) ?? [];
  if (parts.length === 0) return "SQ";
  return parts
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
}

export function Sidebar({ businessName }: { businessName?: string | null }) {
  const pathname = usePathname();

  return (
    <aside className="w-full border-b border-[#E5E7EB] bg-white md:fixed md:inset-y-0 md:left-0 md:z-30 md:w-[220px] md:border-b-0 md:border-r">
      <div className="flex h-full flex-col">
        <div className="px-6 py-7">
          <Link href="/app" className="inline-flex">
            <BrandLogo size="sm" />
          </Link>
        </div>

        <nav className="flex gap-1 overflow-x-auto px-3 pb-3 md:block md:space-y-1 md:overflow-x-visible">
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
                className={cn(
                  "inline-flex items-center gap-2 rounded-[8px] border-l-[3px] px-3 py-2.5 text-sm font-medium md:flex",
                  active
                    ? "border-l-[#2563EB] bg-[#EFF6FF] font-semibold text-[#2563EB]"
                    : "border-l-transparent text-[#6B7280] hover:bg-[#F8F9FC] hover:text-[#111827]"
                )}
              >
                <Icon className="h-4 w-4" />
                {item.label}
              </Link>
            );
          })}
        </nav>

        <div className="hidden flex-1 md:block" />

        <div className="hidden border-t border-[#E5E7EB] px-6 py-5 md:flex md:items-center md:gap-3">
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
    </aside>
  );
}
