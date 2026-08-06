"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  useTransition,
} from "react";
import {
  IconBriefcase,
  IconMentor,
  IconMessage,
  IconReferral,
  IconUsers,
} from "@/components/ui/icons";
import {
  NEEDS_BUBBLE_DETAIL_CAP,
  needsBubbleSummary,
  seeAllHrefForNeeds,
  waitedLabel,
  type NeedInlineAction,
  type NeedItem,
  type NeedType,
} from "@/lib/dashboard-needs";
import { mapMessagingError } from "@/lib/conversations";
import { mapMentorshipError } from "@/lib/mentorship";
import { mapApplicationError } from "@/lib/opportunities";
import { logReferralError, mapReferralError } from "@/lib/referrals";
import { createClient } from "@/lib/supabase/client";
import { formatAbsoluteTime } from "@/lib/format-time";

const ICONS: Record<NeedType, typeof IconMessage> = {
  connection: IconUsers,
  mentorship: IconMentor,
  referral: IconReferral,
  application: IconBriefcase,
  unread_turn: IconMessage,
  followup: IconMessage,
};

const ICON_SOFT: Record<NeedType, string> = {
  connection: "var(--brand-soft)",
  mentorship: "var(--accent-mentors-soft)",
  referral: "var(--accent-referrals-soft)",
  application: "var(--brand-soft)",
  unread_turn: "var(--accent-messages-soft)",
  followup: "var(--accent-messages-soft)",
};

const ICON_SOLID: Record<NeedType, string> = {
  connection: "var(--brand)",
  mentorship: "var(--accent-mentors)",
  referral: "var(--accent-referrals)",
  application: "var(--brand)",
  unread_turn: "var(--accent-messages)",
  followup: "var(--accent-messages)",
};

const EXIT_MS = 180;
const EXPAND_MS = 220;

type Props = {
  items: NeedItem[];
  currentUserId: string;
};

export function NeedsBubbleSkeleton({ className = "" }: { className?: string }) {
  return (
    <div
      className={`inline-flex h-9 w-[11.5rem] max-w-full items-center gap-2 rounded-full border border-teal-900/8 bg-white px-3 shadow-sm ${className}`}
      aria-hidden
    >
      <div className="skeleton h-4 w-4 shrink-0 rounded-full" />
      <div className="skeleton h-4 w-4 shrink-0 rounded-full" />
      <div className="skeleton h-3 flex-1 rounded" />
    </div>
  );
}

export function DashboardNeedsYou({ items: initialItems, currentUserId }: Props) {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);
  const panelId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const [items, setItems] = useState(initialItems);
  const [expanded, setExpanded] = useState(false);
  const [exitingIds, setExitingIds] = useState<Set<string>>(() => new Set());
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  useEffect(() => {
    setItems(initialItems);
  }, [initialItems]);

  const visible = items.filter((i) => !exitingIds.has(i.id));
  const count = visible.length;
  const hasUrgent = visible.some((i) => i.urgent);
  const top = visible.slice(0, NEEDS_BUBBLE_DETAIL_CAP);
  const seeAll = seeAllHrefForNeeds(top);
  const summary = needsBubbleSummary(visible);

  const collapse = useCallback(() => setExpanded(false), []);

  useEffect(() => {
    if (!expanded) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") collapse();
    }
    function onPointerDown(e: MouseEvent | PointerEvent) {
      const root = rootRef.current;
      if (!root) return;
      if (e.target instanceof Node && !root.contains(e.target)) {
        collapse();
      }
    }
    window.addEventListener("keydown", onKey);
    window.addEventListener("pointerdown", onPointerDown);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("pointerdown", onPointerDown);
    };
  }, [expanded, collapse]);

  useEffect(() => {
    if (count === 0) collapse();
  }, [count, collapse]);

  // Live count: refresh when underlying tables change.
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null;
    const scheduleRefresh = () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        startTransition(() => {
          router.refresh();
        });
      }, 400);
    };

    const channel = supabase
      .channel(`dashboard-needs:${currentUserId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "conversations" },
        scheduleRefresh,
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "messages" },
        scheduleRefresh,
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "referral_requests" },
        scheduleRefresh,
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "opportunity_applications" },
        scheduleRefresh,
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "request_matches" },
        scheduleRefresh,
      )
      .subscribe();

    return () => {
      if (timer) clearTimeout(timer);
      void supabase.removeChannel(channel);
    };
  }, [supabase, currentUserId, router]);

  function removeItemOptimistic(id: string) {
    setExitingIds((prev) => new Set(prev).add(id));
    window.setTimeout(() => {
      setItems((prev) => prev.filter((i) => i.id !== id));
      setExitingIds((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
    }, EXIT_MS);
  }

  function restoreItem(item: NeedItem) {
    setExitingIds((prev) => {
      const next = new Set(prev);
      next.delete(item.id);
      return next;
    });
    setItems((prev) => {
      if (prev.some((i) => i.id === item.id)) return prev;
      return [...prev, item].sort(
        (a, b) =>
          a.priority - b.priority ||
          new Date(a.waitedAt).getTime() - new Date(b.waitedAt).getTime(),
      );
    });
  }

  async function runAction(item: NeedItem, action: NeedInlineAction) {
    if (busyId) return;

    if (action === "reply") {
      router.push(item.href);
      return;
    }

    setBusyId(item.id);
    setError(null);
    removeItemOptimistic(item.id);

    try {
      if (item.type === "connection") {
        const status = action === "accept" ? "accepted" : "declined";
        const { error: rpcError } = await supabase.rpc("respond_to_conversation", {
          p_conversation_id: item.entityId,
          p_new_status: status,
        });
        if (rpcError) throw new Error(mapMessagingError(rpcError));
        if (action === "accept" && item.partnerId) {
          router.push(`/messages?with=${item.partnerId}`);
        }
      } else if (item.type === "referral") {
        if (action === "accept") {
          const { data, error: rpcError } = await supabase.rpc(
            "help_with_referral_request",
            { p_request_id: item.entityId },
          );
          if (rpcError) {
            logReferralError("help_with_referral_request RPC (dashboard needs)", rpcError);
            const fallback = await supabase.rpc("accept_referral_request", {
              p_request_id: item.entityId,
            });
            if (fallback.error) {
              throw new Error(
                mapReferralError(
                  fallback.error.message,
                  fallback.error.code,
                ),
              );
            }
            const row = Array.isArray(fallback.data)
              ? fallback.data[0]
              : fallback.data;
            if (!row) {
              throw new Error(
                "Someone else has already taken this — or help didn't go through. Refresh and try another ask.",
              );
            }
          } else {
            const row = Array.isArray(data) ? data[0] : data;
            if (!row) {
              throw new Error(
                "Someone else has already taken this — or help didn't go through. Refresh and try another ask.",
              );
            }
          }
          if (item.partnerId) {
            router.push(`/messages?with=${item.partnerId}`);
          } else {
            router.push("/referrals");
          }
        } else {
          const { error: dismissError } = await supabase
            .from("referral_dismissals")
            .upsert(
              { request_id: item.entityId, user_id: currentUserId },
              { onConflict: "request_id,user_id" },
            );
          if (dismissError) throw new Error(dismissError.message);
        }
      } else if (item.type === "mentorship") {
        const status = action === "accept" ? "accepted" : "declined";
        const { error: updateError } = await supabase
          .from("request_matches")
          .update({ status })
          .eq("id", item.entityId);
        if (updateError) throw new Error(mapMentorshipError(updateError));
        if (action === "accept") {
          // Long answers happen on Mentors / Messages — not inline.
          const studentId = item.studentId ?? item.partnerId;
          if (studentId) {
            const qs = item.requestId
              ? `?with=${studentId}&request=${item.requestId}`
              : `?with=${studentId}`;
            router.push(`/messages${qs}`);
          } else {
            router.push("/mentors");
          }
        }
      } else if (item.type === "application") {
        const status = action === "accept" ? "reviewing" : "closed";
        const { error: rpcError } = await supabase.rpc(
          "decide_opportunity_application",
          {
            p_application_id: item.entityId,
            p_new_status: status,
            p_outcome: status === "closed" ? "not_selected" : null,
          },
        );
        if (rpcError) throw new Error(mapApplicationError(rpcError.message));
        if (action === "accept" && item.partnerId) {
          router.push(`/messages?with=${item.partnerId}`);
        }
      } else {
        router.push(item.href);
      }

      startTransition(() => router.refresh());
    } catch (err) {
      restoreItem(item);
      const message =
        err instanceof Error && err.message.trim()
          ? err.message
          : "Something went wrong. Please try again.";
      setError(message);
    } finally {
      setBusyId(null);
    }
  }

  // Count 0 → render nothing (no caught-up pill / profile nudge).
  if (count === 0) {
    return null;
  }

  return (
    <div ref={rootRef} className="w-full min-w-0 sm:w-auto sm:max-w-md sm:shrink-0">
      <button
        type="button"
        aria-expanded={expanded}
        aria-controls={panelId}
        aria-label={expanded ? "Collapse alerts" : `Expand alerts: ${summary}`}
        onClick={() => setExpanded((v) => !v)}
        className={`inline-flex h-9 w-full max-w-full items-center gap-2 rounded-full border px-3 text-left shadow-sm transition-[background-color,border-color,box-shadow] duration-150 sm:w-auto ${
          hasUrgent
            ? "border-amber-300/80 bg-amber-50 text-amber-950"
            : "border-teal-900/10 bg-white text-slate-800 hover:border-teal-900/16 hover:bg-teal-50/60"
        }`}
      >
        <span
          className={`inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full ${
            hasUrgent ? "bg-amber-200/80 text-amber-800" : "bg-[var(--brand-soft)] text-[var(--brand)]"
          }`}
        >
          <IconUsers size={12} />
        </span>
        <span
          className={`inline-flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full px-1.5 text-[10px] font-bold text-white ${
            hasUrgent ? "bg-amber-600" : "bg-[var(--brand)]"
          }`}
        >
          {count}
        </span>
        <span className="min-w-0 flex-1 truncate text-xs font-semibold sm:flex-none sm:max-w-[14rem]">
          {summary}
        </span>
        {hasUrgent ? (
          <span
            className="h-1.5 w-1.5 shrink-0 rounded-full bg-amber-500"
            aria-label="Urgent"
            title="Urgent"
          />
        ) : null}
      </button>

      <div
        id={panelId}
        className="grid transition-[grid-template-rows] ease-out motion-reduce:transition-none"
        style={{
          gridTemplateRows: expanded ? "1fr" : "0fr",
          transitionDuration: `${EXPAND_MS}ms`,
        }}
      >
        <div className="min-h-0 overflow-hidden">
          <div
            className={`mt-2 rounded-2xl border border-teal-900/8 bg-white p-2 shadow-[0_8px_24px_-16px_rgba(15,23,42,0.2)] sm:p-2.5 ${
              expanded ? "opacity-100" : "opacity-0"
            } transition-opacity duration-200 ease-out motion-reduce:transition-none`}
          >
            {error ? (
              <p className="mb-2 rounded-lg bg-rose-50 px-2.5 py-1.5 text-xs text-rose-700" role="alert">
                {error}
              </p>
            ) : null}
            <ul className="min-w-0 space-y-0.5">
              {top.map((item) => {
                const Icon = ICONS[item.type];
                const exiting = exitingIds.has(item.id);
                const busy = busyId === item.id;
                return (
                  <li
                    key={item.id}
                    className={`min-w-0 transition-[opacity,transform,max-height] ease-out motion-reduce:transition-none ${
                      exiting
                        ? "max-h-0 -translate-y-1 opacity-0"
                        : "max-h-16 translate-y-0 opacity-100"
                    }`}
                    style={{ transitionDuration: `${EXIT_MS}ms` }}
                  >
                    <div className="flex min-w-0 items-center gap-2 rounded-xl px-1 py-1.5 sm:gap-2.5 sm:px-1.5">
                      <span
                        className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg"
                        style={{
                          background: ICON_SOFT[item.type],
                          color: ICON_SOLID[item.type],
                        }}
                      >
                        <Icon size={13} />
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-semibold text-slate-900">
                          {item.text}
                        </p>
                        <p
                          className="text-[11px] text-slate-400"
                          title={formatAbsoluteTime(item.waitedAt)}
                        >
                          Waiting {waitedLabel(item.waitedAt)}
                          {item.urgent ? (
                            <span className="ml-1.5 inline-block h-1.5 w-1.5 rounded-full bg-amber-500 align-middle" />
                          ) : null}
                        </p>
                      </div>
                      <div className="flex shrink-0 items-center gap-1">
                        {item.type === "application" ? (
                          <Link
                            href={item.href}
                            className="hidden rounded-lg px-2 py-1 text-[11px] font-semibold text-slate-500 hover:bg-slate-50 hover:text-slate-800 sm:inline"
                            title="Review pitch & resume"
                          >
                            Review
                          </Link>
                        ) : null}
                        {item.type === "mentorship" ? (
                          <Link
                            href={item.href}
                            className="hidden rounded-lg px-2 py-1 text-[11px] font-semibold text-slate-500 hover:bg-slate-50 hover:text-slate-800 sm:inline"
                            title="Open full ask"
                          >
                            Open
                          </Link>
                        ) : null}
                        {item.inlineActions.includes("decline") ? (
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() => void runAction(item, "decline")}
                            className="rounded-lg px-2 py-1.5 text-xs font-semibold text-slate-500 transition hover:bg-slate-100 hover:text-slate-800 disabled:opacity-50"
                          >
                            {item.type === "referral" || item.type === "application"
                              ? "Not a fit"
                              : "Decline"}
                          </button>
                        ) : null}
                        {item.inlineActions.includes("accept") ? (
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() => void runAction(item, "accept")}
                            className="rounded-lg bg-[var(--brand)] px-2.5 py-1.5 text-xs font-bold text-white transition hover:bg-[var(--brand-dark)] disabled:opacity-50"
                          >
                            {item.actionLabel}
                          </button>
                        ) : null}
                        {item.inlineActions.includes("reply") ? (
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() => void runAction(item, "reply")}
                            className="rounded-lg bg-[var(--brand)] px-2.5 py-1.5 text-xs font-bold text-white transition hover:bg-[var(--brand-dark)] disabled:opacity-50"
                          >
                            Reply
                          </button>
                        ) : null}
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
            {visible.length > NEEDS_BUBBLE_DETAIL_CAP ? (
              <div className="mt-1 border-t border-teal-900/6 px-1.5 pt-2">
                <Link
                  href={seeAll}
                  className="text-xs font-bold text-[var(--brand)] hover:underline"
                >
                  View all →
                </Link>
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}
