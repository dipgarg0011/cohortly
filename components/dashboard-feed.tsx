"use client";

import Link from "next/link";
import { useState } from "react";
import { SurfaceCard } from "@/components/ui/surface-card";
import { EmptyState } from "@/components/ui/empty-state";
import {
  IconBriefcase,
  IconChatEmpty,
  IconMessage,
  IconOpportunityEmpty,
  IconUsers,
} from "@/components/ui/icons";
import { getInitials } from "@/lib/network";
import { formatMessageTime, type Conversation } from "@/lib/messages";
import { deadlineLabel } from "@/lib/referrals";
import type { Opportunity } from "@/lib/opportunities";

type Props = {
  conversations: Conversation[];
  opportunities: Opportunity[];
  currentUserId: string;
};

export function DashboardFeed({
  conversations,
  opportunities,
  currentUserId,
}: Props) {
  const [tab, setTab] = useState<"messages" | "opportunities">("messages");

  return (
    <SurfaceCard className="flex h-full flex-col overflow-hidden p-0">
      <div className="flex border-b border-teal-900/8 p-1.5">
        <TabButton
          active={tab === "messages"}
          onClick={() => setTab("messages")}
          icon={<IconMessage size={14} />}
          label="Messages"
        />
        <TabButton
          active={tab === "opportunities"}
          onClick={() => setTab("opportunities")}
          icon={<IconBriefcase size={14} />}
          label="Opportunities"
        />
      </div>

      <div className="flex-1 p-3">
        {tab === "messages" ? (
          conversations.length === 0 ? (
            <EmptyState
              icon={<IconChatEmpty />}
              title="Your inbox is waiting"
              description="Say hi to someone in the Network — a short message can open a great conversation."
              actionHref="/network"
              actionLabel="Find people"
              accentSoft="var(--accent-messages-soft)"
            />
          ) : (
            <ul className="space-y-1">
              {conversations.map((convo) => {
                const name =
                  convo.partner.full_name?.trim() || "Unnamed member";
                return (
                  <li key={convo.partner.id}>
                    <Link
                      href={`/messages?with=${convo.partner.id}`}
                      className="flex items-start gap-3 rounded-xl px-2.5 py-2.5 transition hover:bg-teal-50/80"
                    >
                      <Avatar
                        name={convo.partner.full_name}
                        url={convo.partner.avatar_url}
                      />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center justify-between gap-2">
                          <span className="truncate text-sm font-bold text-slate-900">
                            {name}
                          </span>
                          <span className="meta-text shrink-0">
                            {formatMessageTime(convo.lastMessage.created_at)}
                          </span>
                        </div>
                        <div className="mt-0.5 flex items-center gap-2">
                          <p className="truncate text-xs text-slate-500">
                            {convo.lastMessage.sender_id === currentUserId
                              ? "You: "
                              : ""}
                            {convo.lastMessage.content}
                          </p>
                          {convo.unreadCount > 0 && (
                            <span className="ml-auto inline-flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full bg-[var(--brand)] px-1.5 text-[10px] font-bold text-white">
                              {convo.unreadCount > 9
                                ? "9+"
                                : convo.unreadCount}
                            </span>
                          )}
                        </div>
                      </div>
                    </Link>
                  </li>
                );
              })}
            </ul>
          )
        ) : opportunities.length === 0 ? (
          <EmptyState
            icon={<IconOpportunityEmpty />}
            title="No openings yet"
            description="When someone posts an internship, job, or startup role, it'll show up here."
            actionHref="/opportunities"
            actionLabel="Browse opportunities"
            accentSoft="var(--accent-opportunities-soft)"
          />
        ) : (
          <ul className="space-y-2">
            {opportunities.map((item) => {
              const deadlineText = deadlineLabel(item.deadline);
              return (
                <li key={item.id}>
                  <Link
                    href="/opportunities"
                    className="block rounded-xl px-2.5 py-2.5 transition hover:bg-indigo-50/70"
                  >
                    <span className="inline-flex rounded-full bg-indigo-50 px-2 py-0.5 text-[11px] font-bold text-indigo-700">
                      {item.type}
                    </span>
                    <p className="mt-1.5 line-clamp-2 text-sm font-bold text-slate-900">
                      {item.title}
                    </p>
                    {item.company?.trim() && (
                      <p className="mt-0.5 truncate text-xs text-slate-500">
                        {item.company.trim()}
                      </p>
                    )}
                    {deadlineText && (
                      <p className="mt-1 text-xs font-semibold text-indigo-700/80">
                        {deadlineText}
                      </p>
                    )}
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <div className="border-t border-teal-900/8 px-4 py-3">
        <Link
          href={tab === "messages" ? "/messages" : "/opportunities"}
          className="text-sm font-bold text-[var(--brand)] hover:underline"
        >
          {tab === "messages" ? "View all messages" : "View all opportunities"} →
        </Link>
      </div>
    </SurfaceCard>
  );
}

function TabButton({
  active,
  onClick,
  icon,
  label,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex flex-1 items-center justify-center gap-1.5 rounded-xl px-3 py-2 text-xs font-bold transition sm:text-sm ${
        active
          ? "bg-white text-teal-900 shadow-sm"
          : "text-slate-500 hover:text-slate-800"
      }`}
    >
      {icon}
      {label}
    </button>
  );
}

function Avatar({
  name,
  url,
}: {
  name: string | null;
  url: string | null;
}) {
  if (url) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={url}
        alt=""
        className="h-9 w-9 shrink-0 rounded-full object-cover ring-2 ring-teal-100"
      />
    );
  }
  return (
    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-teal-100 text-xs font-bold text-teal-800">
      {getInitials(name)}
    </div>
  );
}

export function PeoplePreviewHeader() {
  return (
    <div className="mb-3 flex items-end justify-between gap-3">
      <div>
        <div className="mb-1 flex items-center gap-2">
          <span className="inline-flex h-7 w-7 items-center justify-center rounded-lg bg-[var(--accent-network-soft)] text-[var(--accent-network)]">
            <IconUsers size={14} />
          </span>
          <h2 className="section-title">People you might know</h2>
        </div>
        <p className="text-sm text-[var(--muted)]">
          From your department or batch — start a conversation.
        </p>
      </div>
      <Link
        href="/network"
        className="hidden shrink-0 text-sm font-bold text-[var(--brand)] hover:underline sm:inline"
      >
        View all →
      </Link>
    </div>
  );
}
