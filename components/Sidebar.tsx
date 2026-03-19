"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  BarChart3,
  CreditCard,
  FileText,
  Home,
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
  { href: "/plan", label: "My Plan", icon: CreditCard, matchPaths: ["/plan", "/app/plan"] },
  { href: "/app/team", label: "Team", icon: Users },
  { href: "/app/settings", label: "Settings", icon: Settings }
];

export function Sidebar({ businessName }: { businessName: string }) {
  const pathname = usePathname();
  return (
    <aside className="w-full border-b border-gray-200 bg-white md:h-screen md:w-64 md:border-b-0 md:border-r">
      <div className="flex min-h-20 items-center px-5 py-4">
        <div className="space-y-2">
          <Link href="/app" className="inline-flex">
            <BrandLogo size="sm" />
          </Link>
          <h1 className="truncate text-sm font-semibold text-gray-900">{businessName}</h1>
        </div>
      </div>
      <nav className="flex gap-1 overflow-x-auto p-3 md:block md:space-y-1">
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
                "inline-flex items-center gap-2 rounded-md px-3 py-2 text-sm md:flex",
                active
                  ? "bg-blue-50 font-medium text-primary"
                  : "text-gray-600 hover:bg-gray-100 hover:text-gray-900"
              )}
            >
              <Icon className="h-4 w-4" />
              {item.label}
            </Link>
          );
        })}
      </nav>
    </aside>
  );
}
