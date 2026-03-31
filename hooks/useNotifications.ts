"use client";

import { useEffect, useSyncExternalStore } from "react";
import type { RealtimeChannel } from "@supabase/supabase-js";
import { toast } from "sonner";
import { getAddressParts } from "@/lib/leadPresentation";
import { createClient } from "@/lib/supabase/client";

export type FeedItem = {
  id: string;
  text: string;
  createdAt: string;
};

type NotificationSnapshot = {
  feed: FeedItem[];
};

const store = {
  currentOrgId: null as string | null,
  feed: [] as FeedItem[],
  listeners: new Set<() => void>(),
  subscriberCount: 0,
  channel: null as RealtimeChannel | null,
  resetTimeoutId: undefined as number | undefined
};

function emit() {
  store.listeners.forEach((listener) => listener());
}

function subscribe(listener: () => void) {
  store.listeners.add(listener);

  return () => {
    store.listeners.delete(listener);
  };
}

function getSnapshot(): NotificationSnapshot {
  return { feed: store.feed };
}

function setFeed(nextFeed: FeedItem[] | ((previousFeed: FeedItem[]) => FeedItem[])) {
  store.feed = typeof nextFeed === "function" ? nextFeed(store.feed) : nextFeed;
  emit();
}

function getTodayRange() {
  const start = new Date();
  start.setHours(0, 0, 0, 0);

  const end = new Date(start);
  end.setDate(end.getDate() + 1);

  return { start, end };
}

export function formatNotificationTime(value: string) {
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
  const locality = getAddressParts(address).locality;

  return {
    id,
    text: `New lead received${locality ? ` at ${locality}` : "."}`,
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

function clearResetTimer() {
  if (store.resetTimeoutId) {
    window.clearTimeout(store.resetTimeoutId);
    store.resetTimeoutId = undefined;
  }
}

function scheduleReset() {
  clearResetTimer();

  const now = new Date();
  const nextMidnight = new Date(now);
  nextMidnight.setHours(24, 0, 0, 0);

  store.resetTimeoutId = window.setTimeout(() => {
    setFeed([]);

    if (store.currentOrgId) {
      scheduleReset();
    }
  }, nextMidnight.getTime() - now.getTime());
}

async function loadTodayNotifications(orgId: string) {
  const supabase = createClient();
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

  if (store.currentOrgId !== orgId) return;

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

  setFeed((previousFeed) => mergeFeed(previousFeed, initialNotifications));
}

function stopNotifications() {
  clearResetTimer();

  if (store.channel) {
    createClient().removeChannel(store.channel);
    store.channel = null;
  }

  store.currentOrgId = null;

  if (store.feed.length > 0) {
    setFeed([]);
  }
}

function startNotifications(orgId: string) {
  if (store.currentOrgId === orgId && store.channel) return;

  stopNotifications();
  store.currentOrgId = orgId;
  scheduleReset();
  void loadTodayNotifications(orgId);

  const supabase = createClient();

  store.channel = supabase
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

        setFeed((previousFeed) => mergeFeed(previousFeed, [item]));
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

        setFeed((previousFeed) => mergeFeed(previousFeed, [item]));
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
        toast("A customer viewed your estimate.");
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
}

export function useNotifications(orgId: string) {
  const snapshot = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);

  useEffect(() => {
    if (!orgId) return;

    store.subscriberCount += 1;
    startNotifications(orgId);

    return () => {
      store.subscriberCount = Math.max(0, store.subscriberCount - 1);

      if (store.subscriberCount === 0) {
        stopNotifications();
      }
    };
  }, [orgId]);

  const dismissNotification = (id: string) => {
    setFeed((previousFeed) => previousFeed.filter((item) => item.id !== id));
  };

  return {
    feed: snapshot.feed,
    unreadCount: snapshot.feed.length,
    dismissNotification
  };
}
