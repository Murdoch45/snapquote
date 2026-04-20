"use client";

import { useEffect, useSyncExternalStore } from "react";
import type { RealtimeChannel } from "@supabase/supabase-js";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";

export type FeedItem = {
  id: string;
  type: string;
  title: string;
  text: string;
  screen: string | null;
  screenParams: Record<string, string> | null;
  read: boolean;
  createdAt: string;
};

type DbNotification = {
  id: string;
  org_id: string;
  type: string;
  title: string;
  body: string;
  screen: string | null;
  screen_params: Record<string, string> | null;
  read: boolean;
  created_at: string;
};

function toFeedItem(row: DbNotification): FeedItem {
  return {
    id: row.id,
    type: row.type,
    title: row.title,
    text: row.body,
    screen: row.screen,
    screenParams: row.screen_params,
    read: row.read,
    createdAt: row.created_at
  };
}

// --------------- External store (shared across components) ---------------

type NotificationSnapshot = { feed: FeedItem[] };

const store = {
  currentOrgId: null as string | null,
  feed: [] as FeedItem[],
  listeners: new Set<() => void>(),
  subscriberCount: 0,
  channel: null as RealtimeChannel | null
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

let cachedSnapshot: NotificationSnapshot = { feed: store.feed };

function getSnapshot(): NotificationSnapshot {
  if (cachedSnapshot.feed !== store.feed) {
    cachedSnapshot = { feed: store.feed };
  }
  return cachedSnapshot;
}

function setFeed(nextFeed: FeedItem[]) {
  store.feed = nextFeed;
  emit();
}

// --------------- Toast burst handling ---------------
//
// Realtime can deliver multiple notifications in quick succession (e.g. a
// photo upload triggers several downstream events, or a cron flips a batch
// of estimates to EXPIRED). Without batching, each INSERT fires its own
// toast and they stack visibly. Show the first one immediately, then
// collapse every arrival within a short burst window into a single summary
// toast so a burst reads as one interruption instead of N.

const TOAST_BURST_WINDOW_MS = 1500;

let toastBurstActive = false;
let toastBurstCount = 0;
let toastBurstTimer: ReturnType<typeof setTimeout> | null = null;

function flushToastBurst() {
  if (toastBurstCount > 0) {
    toast(
      `${toastBurstCount} more notification${toastBurstCount === 1 ? "" : "s"}`
    );
  }
  toastBurstActive = false;
  toastBurstCount = 0;
  toastBurstTimer = null;
}

function queueToast(text: string) {
  if (!toastBurstActive) {
    toast(text);
    toastBurstActive = true;
    toastBurstCount = 0;
    toastBurstTimer = setTimeout(flushToastBurst, TOAST_BURST_WINDOW_MS);
  } else {
    toastBurstCount += 1;
  }
}

// --------------- Formatting ---------------

export function formatNotificationTime(value: string) {
  const diffMs = Date.now() - new Date(value).getTime();
  const diffMin = Math.floor(diffMs / 60000);

  if (diffMin < 1) return "Just now";
  if (diffMin < 60) return `${diffMin}m ago`;

  const diffHours = Math.floor(diffMin / 60);
  if (diffHours < 24) return `${diffHours}h ago`;

  const diffDays = Math.floor(diffHours / 24);
  if (diffDays < 7) return `${diffDays}d ago`;

  return new Date(value).toLocaleDateString();
}

// --------------- Data loading & realtime ---------------

async function loadNotifications(orgId: string) {
  const supabase = createClient();

  const { data } = await supabase
    .from("notifications")
    .select("*")
    .eq("org_id", orgId)
    .order("created_at", { ascending: false })
    .limit(50);

  if (store.currentOrgId !== orgId || !data) return;

  setFeed((data as DbNotification[]).map(toFeedItem));
}

function stopNotifications() {
  if (store.channel) {
    createClient().removeChannel(store.channel);
    store.channel = null;
  }
  store.currentOrgId = null;
  if (store.feed.length > 0) setFeed([]);
}

function startNotifications(orgId: string) {
  if (store.currentOrgId === orgId && store.channel) return;

  stopNotifications();
  store.currentOrgId = orgId;
  void loadNotifications(orgId);

  const supabase = createClient();

  store.channel = supabase
    .channel(`notifications-${orgId}`)
    .on(
      "postgres_changes",
      {
        event: "INSERT",
        schema: "public",
        table: "notifications",
        filter: `org_id=eq.${orgId}`
      },
      (payload) => {
        const item = toFeedItem(payload.new as DbNotification);
        setFeed([item, ...store.feed].slice(0, 50));
        queueToast(item.text);
      }
    )
    .on(
      "postgres_changes",
      {
        event: "UPDATE",
        schema: "public",
        table: "notifications",
        filter: `org_id=eq.${orgId}`
      },
      () => {
        void loadNotifications(orgId);
      }
    )
    .subscribe();
}

// --------------- Hook ---------------

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

  const markAllRead = async () => {
    if (!orgId) return;

    const hasUnread = store.feed.some((item) => !item.read);
    if (!hasUnread) return;

    // Optimistic update
    setFeed(store.feed.map((item) => ({ ...item, read: true })));

    const supabase = createClient();
    await supabase
      .from("notifications")
      .update({ read: true })
      .eq("org_id", orgId)
      .eq("read", false);
  };

  return {
    feed: snapshot.feed,
    unreadCount: snapshot.feed.filter((item) => !item.read).length,
    markAllRead
  };
}
