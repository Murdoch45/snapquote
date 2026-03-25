"use client";

import { useEffect, useMemo, useState } from "react";
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

function getTodayRange() {
  const start = new Date();
  start.setHours(0, 0, 0, 0);

  const end = new Date(start);
  end.setDate(end.getDate() + 1);

  return { start, end };
}

function formatNotificationTime(value: string) {
  return new Date(value).toLocaleTimeString([], {
    hour: "numeric",
    minute: "2-digit"
  });
}

function createLeadNotification(
  id: string,
  address: string | null | undefined,
  createdAt: string
): FeedItem {
  return {
    id,
    text: `New lead received${address ? ` at ${address}` : "."}`,
    createdAt
  };
}

function createAcceptedNotification(id: string, createdAt: string): FeedItem {
  return {
    id,
    text: "An estimate was accepted.",
    createdAt
  };
}

function mergeFeed(existing: FeedItem[], incoming: FeedItem[]): FeedItem[] {
  const merged = new Map<string, FeedItem>();

  [...incoming, ...existing].forEach((item) => {
    if (!merged.has(item.id)) {
      merged.set(item.id, item);
    }
  });

  return [...merged.values()]
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    .slice(0, 20);
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
  const unreadCount = useMemo(() => feed.length, [feed]);

  useEffect(() => {
    const scheduleReset = () => {
      const now = new Date();
      const nextMidnight = new Date(now);
      nextMidnight.setHours(24, 0, 0, 0);

      return window.setTimeout(() => {
        setFeed([]);
        setOpen(false);
        scheduleReset();
      }, nextMidnight.getTime() - now.getTime());
    };

    const timeoutId = scheduleReset();
    return () => window.clearTimeout(timeoutId);
  }, []);

  useEffect(() => {
    const supabase = createClient();

    const loadTodayNotifications = async () => {
      const { start, end } = getTodayRange();

      const [{ data: leads }, { data: acceptedEvents }] = await Promise.all([
        supabase
          .from("leads")
          .select("id,address_full,submitted_at")
          .eq("org_id", orgId)
          .gte("submitted_at", start.toISOString())
          .lt("submitted_at", end.toISOString())
          .order("submitted_at", { ascending: false }),
        supabase
          .from("quote_events")
          .select("id,quote_id,created_at")
          .eq("org_id", orgId)
          .eq("event_type", "ACCEPTED")
          .gte("created_at", start.toISOString())
          .lt("created_at", end.toISOString())
          .order("created_at", { ascending: false })
      ]);

      const initialNotifications = [
        ...(leads ?? []).map((lead) =>
          createLeadNotification(
            `lead-${lead.id as string}`,
            lead.address_full as string | null,
            lead.submitted_at as string
          )
        ),
        ...(acceptedEvents ?? []).map((event) =>
          createAcceptedNotification(
            `accepted-quote-${event.quote_id as string}`,
            event.created_at as string
          )
        )
      ];

      setFeed((prev) => mergeFeed(prev, initialNotifications));
    };

    void loadTodayNotifications();

    const channel = supabase
      .channel(`notifications-${orgId}`)
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "leads", filter: `org_id=eq.${orgId}` },
        (payload) => {
          const previousStatus = (payload.old as { ai_status?: string }).ai_status;
          const nextLead = payload.new as {
            id?: string;
            ai_status?: string;
            address_full?: string;
            submitted_at?: string;
          };

          if (previousStatus === "ready" || nextLead.ai_status !== "ready") return;

          const item = createLeadNotification(
            `lead-${nextLead.id ?? crypto.randomUUID()}`,
            nextLead.address_full,
            nextLead.submitted_at ?? new Date().toISOString()
          );

          setFeed((prev) => mergeFeed(prev, [item]));
          toast(item.text);
        }
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "quotes", filter: `org_id=eq.${orgId}` },
        (payload) => {
          const previousStatus = (payload.old as { status?: string }).status;
          const nextQuote = payload.new as { id?: string; status?: string; accepted_at?: string };

          if (previousStatus === nextQuote.status || nextQuote.status !== "ACCEPTED") return;

          const item = createAcceptedNotification(
            `accepted-quote-${nextQuote.id ?? crypto.randomUUID()}`,
            nextQuote.accepted_at ?? new Date().toISOString()
          );

          setFeed((prev) => mergeFeed(prev, [item]));
          toast.success(item.text);
        }
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "quotes", filter: `org_id=eq.${orgId}` },
        (payload) => {
          const previousStatus = (payload.old as { status?: string }).status;
          const nextStatus = (payload.new as { status?: string }).status;
          if (previousStatus === nextStatus || nextStatus !== "VIEWED") return;
          toast("A customer viewed your estimate.", { icon: "👀" });
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
          toast.success("A team member accepted your invite.");
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
            {unreadCount > 0 ? (
              <span className="absolute -right-1 -top-1 rounded-full bg-[#2563EB] px-1.5 text-[10px] text-white">
                {unreadCount}
              </span>
            ) : null}
          </button>

          {open ? (
            <div className="absolute right-0 z-30 mt-2 w-72 rounded-[14px] border border-[#E5E7EB] bg-white p-3 shadow-[0_1px_3px_rgba(0,0,0,0.06),0_4px_16px_rgba(0,0,0,0.04)]">
              <p className="mb-2 text-xs font-medium uppercase tracking-[0.05em] text-[#6B7280]">
                Notifications
              </p>
              {feed.length === 0 ? (
                <p className="text-sm text-[#6B7280]">No notifications today</p>
              ) : (
                <ul className="space-y-2">
                  {feed.map((item) => (
                    <li key={item.id}>
                      <button
                        type="button"
                        className="w-full rounded-[10px] bg-[#F8F9FC] p-3 text-left text-sm text-[#111827] transition-colors hover:bg-[#EEF2FF]"
                        onClick={() =>
                          setFeed((prev) => prev.filter((entry) => entry.id !== item.id))
                        }
                      >
                        <p>{item.text}</p>
                        <p className="mt-1 text-xs text-[#6B7280]">
                          {formatNotificationTime(item.createdAt)}
                        </p>
                      </button>
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
