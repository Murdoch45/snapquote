"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import {
  BarChart3,
  CreditCard,
  FileText,
  Home,
  Link2,
  LogOut,
  Receipt,
  Settings,
  UserCircle2,
  Users
} from "lucide-react";
import { BrandLogo } from "@/components/BrandLogo";
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
  email?: string | null;
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
                ? "border-l-primary bg-accent font-semibold text-primary"
                : "border-l-transparent text-muted-foreground hover:bg-muted hover:text-foreground"
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
  email,
  className,
  onOpenAccount
}: {
  businessName?: string | null;
  email?: string | null;
  className?: string;
  onOpenAccount: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onOpenAccount}
      className={cn(
        "flex w-full items-center gap-3 border-t border-border px-6 py-5 text-left transition-colors hover:bg-muted",
        className
      )}
      aria-label="Open account menu"
    >
      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-accent text-sm font-semibold text-primary">
        {getInitials(businessName)}
      </div>
      <div className="min-w-0">
        <p className="truncate text-sm font-medium text-foreground">
          {businessName ?? "SnapQuote"}
        </p>
        {email ? (
          <p className="truncate text-xs text-muted-foreground">{email}</p>
        ) : null}
      </div>
    </button>
  );
}

function AccountSheet({
  open,
  onClose,
  businessName,
  email
}: {
  open: boolean;
  onClose: () => void;
  businessName?: string | null;
  email?: string | null;
}) {
  const router = useRouter();
  const [signingOut, setSigningOut] = useState(false);

  // Close on Escape for accessibility.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  const handleSignOut = async () => {
    if (signingOut) return;
    setSigningOut(true);
    try {
      const supabase = createClient();
      await supabase.auth.signOut();
      router.push("/login");
    } finally {
      setSigningOut(false);
    }
  };

  return (
    <div
      className={cn(
        "fixed inset-0 z-50",
        open ? "visible pointer-events-auto" : "invisible pointer-events-none"
      )}
      aria-hidden={!open}
    >
      <button
        type="button"
        aria-label="Close account menu"
        onClick={onClose}
        className={cn(
          "absolute inset-0 bg-foreground/40 transition-opacity duration-200",
          open ? "opacity-100" : "opacity-0"
        )}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Account"
        className={cn(
          "absolute inset-x-0 bottom-0 rounded-t-[20px] border-t border-border bg-background px-6 pb-8 pt-3 shadow-[0_-8px_40px_rgba(15,23,42,0.18)] transition-transform duration-200 ease-out",
          open ? "translate-y-0" : "translate-y-full"
        )}
        style={{ minHeight: "32vh", maxHeight: "40vh" }}
      >
        <div className="mx-auto mb-4 h-1.5 w-10 rounded-full bg-border" aria-hidden />
        <div className="flex items-center gap-3">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-accent text-base font-semibold text-primary">
            {getInitials(businessName)}
          </div>
          <div className="min-w-0">
            <p className="truncate text-base font-semibold text-foreground">
              {businessName ?? "SnapQuote"}
            </p>
            {email ? (
              <p className="truncate text-sm text-muted-foreground">{email}</p>
            ) : null}
          </div>
        </div>
        <button
          type="button"
          onClick={handleSignOut}
          disabled={signingOut}
          className="mt-6 inline-flex w-full items-center justify-center gap-2 rounded-[12px] border border-red-300 dark:border-red-700 bg-card px-5 py-3 text-sm font-semibold text-red-600 dark:text-red-400 transition-colors hover:bg-red-50 dark:hover:bg-red-950/30 disabled:opacity-60"
        >
          <LogOut className="h-4 w-4" />
          {signingOut ? "Signing out..." : "Sign Out"}
        </button>
      </div>
    </div>
  );
}

function MobileSidebar({
  open,
  onClose,
  businessName,
  email
}: {
  open: boolean;
  onClose?: () => void;
  businessName?: string | null;
  email?: string | null;
}) {
  const pathname = usePathname();
  const [accountOpen, setAccountOpen] = useState(false);

  return (
    <>
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
            "absolute inset-0 bg-foreground/40 transition-opacity duration-200",
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
          <SidebarNav pathname={pathname} onNavigate={onClose} />
          {businessName || email ? (
            <SidebarFooter
              businessName={businessName}
              email={email}
              className="mt-auto"
              onOpenAccount={() => setAccountOpen(true)}
            />
          ) : null}
        </aside>
      </div>
      <AccountSheet
        open={accountOpen}
        onClose={() => setAccountOpen(false)}
        businessName={businessName}
        email={email}
      />
    </>
  );
}

export function Sidebar({
  orgId: _orgId,
  businessName,
  email,
  mode = "desktop",
  open = false,
  onClose
}: SidebarProps) {
  const pathname = usePathname();
  const [accountOpen, setAccountOpen] = useState(false);

  if (mode === "mobile") {
    return <MobileSidebar open={open} onClose={onClose} businessName={businessName} email={email} />;
  }

  return (
    <>
      <aside className="hidden md:fixed md:inset-y-0 md:left-0 md:z-30 md:flex md:w-[220px] md:flex-col md:border-r md:border-border md:bg-background">
        <div className="flex h-full flex-col">
          <div className="px-6 py-7">
            <Link href="/app" className="inline-flex">
              <BrandLogo size="sm" />
            </Link>
          </div>

          <SidebarNav pathname={pathname} />

          <SidebarFooter
            businessName={businessName}
            email={email}
            className="mt-auto"
            onOpenAccount={() => setAccountOpen(true)}
          />
        </div>
      </aside>
      <AccountSheet
        open={accountOpen}
        onClose={() => setAccountOpen(false)}
        businessName={businessName}
        email={email}
      />
    </>
  );
}
