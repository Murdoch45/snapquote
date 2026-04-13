"use client";

import { type FeedItem, formatNotificationTime } from "@/hooks/useNotifications";
import { cn } from "@/lib/utils";

type NotificationsFeedProps = {
  feed: FeedItem[];
  onDismiss: (id: string) => void;
  className?: string;
  titleClassName?: string;
  emptyClassName?: string;
  listClassName?: string;
  itemClassName?: string;
  timeClassName?: string;
};

export function NotificationsFeed({
  feed,
  onDismiss,
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
        <p className={cn("text-sm text-muted-foreground", emptyClassName)}>No notifications today</p>
      ) : (
        <ul className={cn("space-y-2", listClassName)}>
          {feed.map((item) => (
            <li key={item.id}>
              <button
                type="button"
                className={cn(
                  "min-h-[44px] w-full rounded-[10px] bg-muted p-3 text-left text-sm text-foreground transition-colors hover:bg-accent",
                  itemClassName
                )}
                onClick={() => onDismiss(item.id)}
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
