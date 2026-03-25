"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { Bell, LogOut } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/client";

type FeedItem = {
  id: string;
  text: string;
  createdAt: string;
};

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

  return "Dashboard";
}

export function TopBar({
  email,
  orgId,
  businessName
}: {
  email?: string | null;
  orgId: string;
  businessName?: string | null;
}) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [feed, setFeed] = useState<FeedItem[]>([]);

  useEffect(() => {
    const supabase = createClient();
    const channel = supabase
      .channel(`notifications-${orgId}`)
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "leads", filter: `org_id=eq.${orgId}` },
        (payload) => {
          const previousStatus = (payload.old as { ai_status?: string }).ai_status;
          const nextStatus = (payload.new as { ai_status?: string }).ai_status;
          if (previousStatus === "ready" || nextStatus !== "ready") return;
          const text = `New lead received at ${(payload.new as { address_full?: string }).address_full}`;
          setFeed((prev) =>
            [{ id: crypto.randomUUID(), text, createdAt: new Date().toISOString() }, ...prev].slice(
              0,
              12
            )
          );
          toast(text);
        }
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "quotes", filter: `org_id=eq.${orgId}` },
        (payload) => {
          const previousStatus = (payload.old as { status?: string }).status;
          const nextStatus = (payload.new as { status?: string }).status;
          if (previousStatus === nextStatus) return;
          if (nextStatus !== "ACCEPTED") return;
          const text = "An estimate was accepted";
          setFeed((prev) =>
            [{ id: crypto.randomUUID(), text, createdAt: new Date().toISOString() }, ...prev].slice(
              0,
              12
            )
          );
          toast.success(text);
        }
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "quotes", filter: `org_id=eq.${orgId}` },
        (payload) => {
          const previousStatus = (payload.old as { status?: string }).status;
          const nextStatus = (payload.new as { status?: string }).status;
          if (previousStatus === nextStatus || nextStatus !== "VIEWED") return;
          const text = "A customer viewed your estimate.";
          setFeed((prev) =>
            [{ id: crypto.randomUUID(), text, createdAt: new Date().toISOString() }, ...prev].slice(
              0,
              12
            )
          );
          toast(text, { icon: "👀" });
        }
      )
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "pending_invites",
          filter: `org_id=eq.${orgId}`
        },
        (payload) => {
          const previousStatus = (payload.old as { status?: string }).status;
          const nextStatus = (payload.new as { status?: string }).status;
          if (previousStatus === nextStatus || nextStatus !== "ACCEPTED") return;
          const text = "A team member accepted your invite.";
          setFeed((prev) =>
            [{ id: crypto.randomUUID(), text, createdAt: new Date().toISOString() }, ...prev].slice(
              0,
              12
            )
          );
          toast.success(text);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [orgId]);

  const onLogout = async () => {
    const supabase = createClient();
    await supabase.auth.signOut();
    window.location.href = "/login";
  };

  return (
    <header className="sticky top-0 z-20 flex h-16 items-center justify-between border-b border-[#E5E7EB] bg-white px-6">
      <div className="min-w-0">
        <p className="text-2xl font-bold text-[#111827]">{getPageTitle(pathname)}</p>
      </div>

      <div className="flex items-center gap-4">
        <div className="relative">
          <button
            type="button"
            className="inline-flex h-9 w-9 items-center justify-center rounded-[8px] border border-[#E5E7EB] bg-white text-[#6B7280] transition-colors hover:bg-[#F8F9FC] hover:text-[#111827]"
            aria-label="Notifications"
            onClick={() => setOpen((value) => !value)}
          >
            <Bell className="h-4 w-4" />
            {feed.length > 0 ? (
              <span className="absolute -right-1 -top-1 rounded-full bg-[#2563EB] px-1.5 text-[10px] text-white">
                {feed.length}
              </span>
            ) : null}
          </button>

          {open ? (
            <div className="absolute right-0 z-30 mt-2 w-72 rounded-[14px] border border-[#E5E7EB] bg-white p-3 shadow-[0_1px_3px_rgba(0,0,0,0.06),0_4px_16px_rgba(0,0,0,0.04)]">
              <p className="mb-2 text-xs font-medium uppercase tracking-[0.05em] text-[#6B7280]">
                Notifications
              </p>
              {feed.length === 0 ? (
                <p className="text-sm text-[#6B7280]">No notifications yet.</p>
              ) : (
                <ul className="space-y-2">
                  {feed.map((item) => (
                    <li key={item.id} className="rounded-[10px] bg-[#F8F9FC] p-3 text-sm text-[#111827]">
                      <p>{item.text}</p>
                      <p className="mt-1 text-xs text-[#6B7280]">
                        {new Date(item.createdAt).toLocaleTimeString()}
                      </p>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          ) : null}
        </div>

        <div className="min-w-0 text-right">
          <p className="truncate text-sm font-medium text-[#111827]">
            {businessName ?? "SnapQuote"}
          </p>
          <p className="truncate text-sm text-[#6B7280]">{email ?? "Account"}</p>
        </div>

        <Button variant="outline" size="sm" onClick={onLogout}>
          <LogOut className="mr-2 h-4 w-4" />
          Sign out
        </Button>
      </div>
    </header>
  );
}
