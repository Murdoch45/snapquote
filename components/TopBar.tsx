"use client";

import { useEffect, useState } from "react";
import { Bell, LogOut } from "lucide-react";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";

type FeedItem = {
  id: string;
  text: string;
  createdAt: string;
};

export function TopBar({ email, orgId }: { email?: string | null; orgId: string }) {
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
          const text = `New lead received at ${(payload.new as any).address_full}`;
          setFeed((prev) => [{ id: crypto.randomUUID(), text, createdAt: new Date().toISOString() }, ...prev].slice(0, 12));
          toast(text);
        }
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "quotes", filter: `org_id=eq.${orgId}` },
        (payload) => {
          if ((payload.new as any).status !== "ACCEPTED") return;
          const text = "A quote was accepted";
          setFeed((prev) => [{ id: crypto.randomUUID(), text, createdAt: new Date().toISOString() }, ...prev].slice(0, 12));
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
    <header className="sticky top-0 z-20 flex h-16 items-center justify-between border-b border-gray-200 bg-white px-4 md:px-6">
      <div className="min-w-0">
        <p className="text-xs text-gray-500">Contractor Dashboard</p>
        <p className="truncate text-sm font-medium text-gray-800">{email ?? "Account"}</p>
      </div>
      <div className="flex items-center gap-2">
        <div className="relative">
          <button
            type="button"
            className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-gray-200 text-gray-600 hover:bg-gray-100"
            aria-label="Notifications"
            onClick={() => setOpen((v) => !v)}
          >
            <Bell className="h-4 w-4" />
            {feed.length > 0 ? (
              <span className="absolute -right-1 -top-1 rounded-full bg-blue-600 px-1.5 text-[10px] text-white">
                {feed.length}
              </span>
            ) : null}
          </button>
          {open && (
            <div className="absolute right-0 z-30 mt-2 w-72 rounded-lg border border-gray-200 bg-white p-3 shadow-lg">
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">
                Notifications
              </p>
              {feed.length === 0 ? (
                <p className="text-sm text-gray-500">No notifications yet.</p>
              ) : (
                <ul className="space-y-2">
                  {feed.map((item) => (
                    <li key={item.id} className="rounded-md bg-gray-50 p-2 text-sm text-gray-700">
                      <p>{item.text}</p>
                      <p className="text-xs text-gray-500">
                        {new Date(item.createdAt).toLocaleTimeString()}
                      </p>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </div>
        <Button variant="outline" size="sm" onClick={onLogout}>
          <LogOut className="mr-2 h-4 w-4" />
          Sign out
        </Button>
      </div>
    </header>
  );
}
