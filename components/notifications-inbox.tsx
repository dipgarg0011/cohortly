"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { EmptyState } from "@/components/ui/empty-state";
import { IconBell } from "@/components/ui/icons";
import {
  fetchNotifications,
  formatNotificationTime,
  markAllNotificationsRead,
  markNotificationRead,
  type AppNotification,
} from "@/lib/notifications";
import {
  hrefFromNotificationPayload,
  type PushPayload,
} from "@/lib/notification-routing";

type Props = {
  userId: string;
  initialItems: AppNotification[];
};

export function NotificationsInbox({ userId, initialItems }: Props) {
  const router = useRouter();
  const [items, setItems] = useState<AppNotification[]>(initialItems);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const supabase = createClient();
    setError(null);
    try {
      const next = await fetchNotifications(supabase, userId);
      setItems(next);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Could not load notifications",
      );
    }
  }, [userId]);

  useEffect(() => {
    setItems(initialItems);
  }, [initialItems]);

  useEffect(() => {
    const supabase = createClient();
    const channel = supabase
      .channel(`notifications-inbox:${userId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "notifications",
          filter: `user_id=eq.${userId}`,
        },
        () => {
          void load();
        },
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [userId, load]);

  async function onOpen(item: AppNotification) {
    const supabase = createClient();
    if (!item.read_at) {
      await markNotificationRead(supabase, item.id);
      setItems((prev) =>
        prev.map((n) =>
          n.id === item.id
            ? { ...n, read_at: new Date().toISOString() }
            : n,
        ),
      );
    }

    const payload: PushPayload = {
      ...(item.payload ?? {}),
      type:
        typeof item.payload?.type === "string"
          ? item.payload.type
          : item.type,
      notification_type: item.type,
      link: item.link ?? undefined,
    };
    const href =
      hrefFromNotificationPayload(payload) ??
      (item.link?.startsWith("/") ? item.link : null);
    if (href) router.push(href);
  }

  async function onMarkAll() {
    if (!userId || busy) return;
    setBusy(true);
    const supabase = createClient();
    await markAllNotificationsRead(supabase, userId);
    const now = new Date().toISOString();
    setItems((prev) => prev.map((n) => ({ ...n, read_at: n.read_at ?? now })));
    setBusy(false);
  }

  const unread = items.some((n) => !n.read_at);

  return (
    <div className="surface-card overflow-hidden !p-0">
      <div className="flex items-center justify-between gap-3 border-b border-teal-900/8 px-4 py-3 sm:px-5">
        <p className="text-sm text-slate-500">
          Only what needs your attention.
        </p>
        {unread ? (
          <button
            type="button"
            disabled={busy}
            onClick={() => void onMarkAll()}
            className="shrink-0 text-sm font-semibold text-[var(--brand)] hover:underline disabled:opacity-60"
          >
            Mark all read
          </button>
        ) : null}
      </div>

      {error ? (
        <p
          role="alert"
          className="mx-4 my-3 rounded-lg bg-red-50 px-3 py-2 text-xs text-red-700 sm:mx-5"
        >
          {error}
        </p>
      ) : null}

      {items.length === 0 ? (
        <div className="px-4 py-10 sm:px-5">
          <EmptyState
            icon={<IconBell size={40} />}
            title="You're all caught up"
            description="Requests, messages, applications, and other updates show up here."
            accentSoft="var(--accent-messages-soft)"
          />
        </div>
      ) : (
        <ul className="divide-y divide-slate-100">
          {items.map((item) => {
            const unreadRow = !item.read_at;
            return (
              <li key={item.id}>
                <button
                  type="button"
                  onClick={() => void onOpen(item)}
                  className={`flex w-full flex-col gap-1 px-4 py-3.5 text-left transition hover:bg-teal-50/60 sm:px-5 ${
                    unreadRow ? "bg-teal-50/40" : "bg-white"
                  }`}
                >
                  <div className="flex min-w-0 items-center gap-2">
                    {unreadRow ? (
                      <span
                        className="h-2 w-2 shrink-0 rounded-full bg-[var(--brand)]"
                        aria-hidden
                      />
                    ) : null}
                    <span
                      className={`min-w-0 flex-1 truncate text-sm ${
                        unreadRow
                          ? "font-bold text-slate-900"
                          : "font-semibold text-slate-800"
                      }`}
                    >
                      {item.title}
                    </span>
                    <span className="shrink-0 text-xs text-slate-400">
                      {formatNotificationTime(item.created_at)}
                    </span>
                  </div>
                  {item.body ? (
                    <p
                      className={`line-clamp-2 text-sm text-slate-600 ${
                        unreadRow ? "pl-4" : ""
                      }`}
                    >
                      {item.body}
                    </p>
                  ) : null}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
