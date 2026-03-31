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
          "mb-2 text-xs font-medium uppercase tracking-[0.05em] text-[#6B7280]",
          titleClassName
        )}
      >
        Notifications
      </p>

      {feed.length === 0 ? (
        <p className={cn("text-sm text-[#6B7280]", emptyClassName)}>No notifications today</p>
      ) : (
        <ul className={cn("space-y-2", listClassName)}>
          {feed.map((item) => (
            <li key={item.id}>
              <button
                type="button"
                className={cn(
                  "min-h-[44px] w-full rounded-[10px] bg-[#F8F9FC] p-3 text-left text-sm text-[#111827] transition-colors hover:bg-[#EEF2FF]",
                  itemClassName
                )}
                onClick={() => onDismiss(item.id)}
              >
                <p>{item.text}</p>
                <p className={cn("mt-1 text-xs text-[#6B7280]", timeClassName)}>
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
