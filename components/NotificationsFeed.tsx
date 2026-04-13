"use client";

import { type FeedItem, formatNotificationTime } from "@/hooks/useNotifications";
import { cn } from "@/lib/utils";

type NotificationsFeedProps = {
  feed: FeedItem[];
  onItemClick: (item: FeedItem) => void;
  className?: string;
  titleClassName?: string;
  emptyClassName?: string;
  listClassName?: string;
  itemClassName?: string;
  timeClassName?: string;
};

export function NotificationsFeed({
  feed,
  onItemClick,
  className,
  titleClassName,
  emptyClassName,
  listClassName,
  itemClassName,
  timeClassName
}: NotificationsFeedProps) {
  return (
    <div className={className}>
      <p
        className={cn(
          "mb-2 text-xs font-medium uppercase tracking-[0.05em] text-muted-foreground",
          titleClassName
        )}
      >
        Notifications
      </p>

      {feed.length === 0 ? (
        <p className={cn("text-sm text-muted-foreground", emptyClassName)}>No notifications</p>
      ) : (
        <ul className={cn("max-h-[280px] space-y-2 overflow-y-auto", listClassName)}>
          {feed.map((item) => (
            <li key={item.id}>
              <button
                type="button"
                className={cn(
                  "min-h-[44px] w-full rounded-[10px] p-3 text-left text-sm transition-colors",
                  item.read
                    ? "bg-muted/50 text-muted-foreground hover:bg-muted"
                    : "bg-muted text-foreground hover:bg-accent",
                  itemClassName
                )}
                onClick={() => onItemClick(item)}
              >
                <p>{item.text}</p>
                <p className={cn("mt-1 text-xs text-muted-foreground", timeClassName)}>
                  {formatNotificationTime(item.createdAt)}
                </p>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
