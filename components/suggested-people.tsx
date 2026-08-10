"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ProfileCard } from "@/components/profile-card";
import { PersonRow } from "@/components/ui/person-row";
import { ConnectionRequestModal } from "@/components/connection-request-modal";
import { EmptyState } from "@/components/ui/empty-state";
import { IconNetworkEmpty } from "@/components/ui/icons";
import {
  connectionActionFor,
  findConversationWith,
  type ConnectionAction,
  type ConversationRow,
} from "@/lib/conversations";
import type { NetworkProfile } from "@/lib/network";

type Props = {
  profiles: NetworkProfile[];
  currentUserId: string;
  initialConversations?: ConversationRow[];
  compact?: boolean;
  dense?: boolean;
  limit?: number;
  /** When true, `limit` only applies below the `sm` breakpoint */
  mobileOnlyLimit?: boolean;
};

function ActionButton({
  label,
  kind,
  disabled,
  onClick,
}: {
  label: string;
  kind: ConnectionAction["kind"];
  disabled?: boolean;
  onClick: () => void;
}) {
  if (kind === "request_sent") {
    return (
      <span className="inline-flex min-h-8 min-w-[4.5rem] items-center justify-center rounded-full bg-slate-100 px-3 text-xs font-semibold text-slate-500">
        {label}
      </span>
    );
  }

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      className="inline-flex min-h-10 min-w-[5.25rem] items-center justify-center rounded-xl bg-[var(--brand)] px-3.5 text-sm font-bold text-white transition hover:bg-[var(--brand-dark)] disabled:cursor-not-allowed disabled:opacity-55"
    >
      {label}
    </button>
  );
}

export function SuggestedPeople({
  profiles,
  currentUserId,
  initialConversations = [],
  compact = false,
  dense = false,
  limit,
  mobileOnlyLimit = false,
}: Props) {
  const router = useRouter();
  const currentYear = new Date().getFullYear();
  const [conversations, setConversations] =
    useState<ConversationRow[]>(initialConversations);
  const [requestTarget, setRequestTarget] = useState<NetworkProfile | null>(
    null,
  );

  // Never show the logged-in user in suggestions.
  const others = useMemo(
    () => profiles.filter((p) => p.id !== currentUserId),
    [profiles, currentUserId],
  );

  // Resolve connection state for every suggestion from the one conversations list.
  // Blocked → hide; declined → Connect again.
  const actionById = useMemo(() => {
    const map: Record<
      string,
      {
        kind: ConnectionAction["kind"];
        label?: string;
        disabled?: boolean;
      }
    > = {};
    for (const profile of others) {
      const conv = findConversationWith(
        conversations,
        currentUserId,
        profile.id,
      );
      const action = connectionActionFor(conv);
      if (action.kind === "hidden") {
        map[profile.id] = { kind: "hidden" };
      } else if (action.kind === "message") {
        map[profile.id] = {
          kind: "message",
          label: "Message",
          disabled: false,
        };
      } else if (action.kind === "request_sent") {
        map[profile.id] = {
          kind: "request_sent",
          label: "Sent",
          disabled: true,
        };
      } else {
        map[profile.id] = {
          kind: "send_request",
          label: conv?.status === "declined" ? "Connect again" : "Connect",
          disabled: false,
        };
      }
    }
    return map;
  }, [others, conversations, currentUserId]);

  const visible = useMemo(
    () => others.filter((p) => actionById[p.id]?.kind !== "hidden"),
    [others, actionById],
  );

  const hasMore = limit != null && visible.length > limit;

  if (visible.length === 0) {
    if (dense) return null;
    return (
      <EmptyState
        icon={<IconNetworkEmpty />}
        title="Your circle is waiting"
        description="No close matches from your department or batch yet. Explore the full network to find seniors and peers."
        actionHref="/network"
        actionLabel="Explore Network"
        accentSoft="var(--accent-network-soft)"
      />
    );
  }

  const denseItems = visible
    .map((profile, index) => {
      const hideOnMobile =
        mobileOnlyLimit && limit != null && index >= limit;
      const hideAlways =
        !mobileOnlyLimit && limit != null && index >= limit;
      if (hideAlways) return null;

      const state = actionById[profile.id];
      if (!state || state.kind === "hidden") return null;

      const onSayHi =
        state.kind === "message"
          ? () => router.push(`/messages?with=${profile.id}`)
          : state.kind === "send_request"
            ? () => setRequestTarget(profile)
            : () => undefined;

      return (
        <li
          key={profile.id}
          className={`min-w-0 max-w-full overflow-hidden border-b border-teal-900/8 last:border-b-0 ${
            hideOnMobile ? "hidden lg:block" : ""
          }`}
        >
          <PersonRow
            flush
            profile={profile}
            action={
              <ActionButton
                label={state.label ?? "Connect"}
                kind={state.kind}
                disabled={state.disabled}
                onClick={onSayHi}
              />
            }
          />
        </li>
      );
    })
    .filter(Boolean);

  return (
    <>
      {dense ? (
        <ul className="mx-auto w-full min-w-0 max-w-full overflow-hidden rounded-2xl border border-teal-900/8 bg-white">
          {denseItems}
        </ul>
      ) : (
        <ul
          className={`mx-auto grid w-full min-w-0 max-w-full grid-cols-1 gap-4 overflow-x-clip ${
            compact ? "lg:grid-cols-2" : "md:grid-cols-2 lg:grid-cols-3"
          }`}
        >
          {visible.map((profile, index) => {
            const hideOnMobile =
              mobileOnlyLimit && limit != null && index >= limit;
            const hideAlways =
              !mobileOnlyLimit && limit != null && index >= limit;
            if (hideAlways) return null;

            const state = actionById[profile.id];
            if (!state || state.kind === "hidden") return null;

            const itemClass = `min-w-0 max-w-full overflow-hidden${
              hideOnMobile ? " hidden lg:block" : ""
            }`;

            const onSayHi =
              state.kind === "message"
                ? () => router.push(`/messages?with=${profile.id}`)
                : state.kind === "send_request"
                  ? () => setRequestTarget(profile)
                  : () => undefined;

            return (
              <li key={profile.id} className={itemClass}>
                <ProfileCard
                  profile={profile}
                  currentYear={currentYear}
                  dense={false}
                  accent="network"
                  onSayHi={onSayHi}
                  sayHiLabel={state.label}
                  sayHiDisabled={state.disabled}
                />
              </li>
            );
          })}
        </ul>
      )}

      {hasMore && !dense && (
        <div className="mt-3 text-center sm:text-left">
          <Link
            href="/network"
            className="text-sm font-bold text-[var(--brand)] hover:underline"
          >
            See all →
          </Link>
        </div>
      )}

      {requestTarget && (
        <ConnectionRequestModal
          open
          onClose={() => setRequestTarget(null)}
          currentUserId={currentUserId}
          recipientId={requestTarget.id}
          recipientName={requestTarget.full_name}
          onSent={(recipientId) => {
            setConversations((prev) => {
              if (findConversationWith(prev, currentUserId, recipientId)) {
                return prev.map((c) => {
                  const match =
                    (c.initiator_id === currentUserId &&
                      c.recipient_id === recipientId) ||
                    (c.initiator_id === recipientId &&
                      c.recipient_id === currentUserId);
                  return match
                    ? {
                        ...c,
                        status: "pending" as const,
                        intro_message_sent: true,
                      }
                    : c;
                });
              }
              return [
                ...prev,
                {
                  id: `local-${recipientId}`,
                  initiator_id: currentUserId,
                  recipient_id: recipientId,
                  status: "pending",
                  unlock_reason: null,
                  intro_message_sent: true,
                  created_at: new Date().toISOString(),
                  updated_at: new Date().toISOString(),
                },
              ];
            });
            setRequestTarget(null);
            router.push(`/messages?with=${recipientId}`);
          }}
        />
      )}
    </>
  );
}
