"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ProfileCard } from "@/components/profile-card";
import { ConnectionRequestModal } from "@/components/connection-request-modal";
import { EmptyState } from "@/components/ui/empty-state";
import { IconNetworkEmpty } from "@/components/ui/icons";
import {
  connectionActionFor,
  findConversationWith,
  type ConversationRow,
} from "@/lib/conversations";
import type { NetworkProfile } from "@/lib/network";

type Props = {
  profiles: NetworkProfile[];
  currentUserId: string;
  initialConversations?: ConversationRow[];
  compact?: boolean;
};

export function SuggestedPeople({
  profiles,
  currentUserId,
  initialConversations = [],
  compact = false,
}: Props) {
  const router = useRouter();
  const currentYear = new Date().getFullYear();
  const [conversations, setConversations] =
    useState<ConversationRow[]>(initialConversations);
  const [requestTarget, setRequestTarget] = useState<NetworkProfile | null>(
    null,
  );

  if (profiles.length === 0) {
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

  function actionProps(profile: NetworkProfile) {
    const conv = findConversationWith(
      conversations,
      currentUserId,
      profile.id,
    );
    const action = connectionActionFor(conv);

    if (action.kind === "hidden") {
      return { onSayHi: undefined as (() => void) | undefined };
    }
    if (action.kind === "message") {
      return {
        onSayHi: () => router.push(`/messages?with=${profile.id}`),
        sayHiLabel: "Message",
        sayHiDisabled: false,
      };
    }
    if (action.kind === "request_sent") {
      return {
        onSayHi: () => undefined,
        sayHiLabel: "Request sent",
        sayHiDisabled: true,
      };
    }
    return {
      onSayHi: () => setRequestTarget(profile),
      sayHiLabel: "Send Request",
      sayHiDisabled: false,
    };
  }

  return (
    <>
      <ul
        className={`mx-auto grid w-full min-w-0 max-w-full grid-cols-1 gap-4 overflow-x-clip ${
          compact ? "sm:grid-cols-2" : "sm:grid-cols-2 lg:grid-cols-3"
        }`}
      >
        {profiles.map((profile) => {
          const props = actionProps(profile);
          return (
            <li key={profile.id} className="min-w-0 max-w-full overflow-hidden">
              <ProfileCard
                profile={profile}
                currentYear={currentYear}
                accent="network"
                onSayHi={props.onSayHi}
                sayHiLabel={props.sayHiLabel}
                sayHiDisabled={props.sayHiDisabled}
              />
            </li>
          );
        })}
      </ul>

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
