"use client";

import Link from "next/link";
import { useState } from "react";
import { SurfaceCard } from "@/components/ui/surface-card";
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
    <SurfaceCard className="flex h-full w-full min-w-0 max-w-full flex-col overflow-hidden p-0">
      <div className="flex min-w-0 border-b border-teal-900/8 p-1.5">
        <TabButton
          active={tab === "messages"}
          onClick={() => setTab("messages")}
          icon={<IconMessage size={14} />}
          label="Messages"
          shortLabel="Chats"
        />
        <TabButton
          active={tab === "opportunities"}
          onClick={() => setTab("opportunities")}
          icon={<IconBriefcase size={14} />}
          label="Opportunities"
          shortLabel="Jobs"
        />
      </div>

      <div className="min-w-0 max-w-full flex-1 overflow-x-clip p-2.5 sm:p-3">
        {tab === "messages" ? (
          conversations.length === 0 ? (
            <CompactEmpty
              icon={<IconChatEmpty />}
              title="Your inbox is waiting"
              description="Say hi to someone in the Network."
              actionHref="/network"
              actionLabel="Find people"
              soft="var(--accent-messages-soft)"
            />
          ) : (
            <ul className="min-w-0 space-y-1">
              {conversations.map((convo) => {
                const name =
                  convo.partner.full_name?.trim() || "Unnamed member";
                return (
                  <li key={convo.partner.id} className="min-w-0 max-w-full">
                    <Link
                      href={`/messages?with=${convo.partner.id}`}
                      className="flex min-w-0 max-w-full items-start gap-2.5 rounded-xl px-2 py-2 transition hover:bg-teal-50/80 sm:gap-3 sm:px-2.5 sm:py-2.5"
                    >
                      <Avatar
                        name={convo.partner.full_name}
                        url={convo.partner.avatar_url}
                      />
                      <div className="min-w-0 flex-1 overflow-hidden">
                        <div className="flex min-w-0 items-center justify-between gap-2">
                          <span
                            title={name}
                            className="min-w-0 truncate text-sm font-bold text-slate-900"
                          >
                            {name}
                          </span>
                          <span className="meta-text shrink-0">
                            {formatMessageTime(convo.lastMessage.created_at)}
                          </span>
                        </div>
                        <div className="mt-0.5 flex min-w-0 items-center gap-2">
                          <p className="min-w-0 truncate text-xs text-slate-500">
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
          <CompactEmpty
            icon={<IconOpportunityEmpty />}
            title="No openings yet"
            description="Internships and jobs will show up here."
            actionHref="/opportunities"
            actionLabel="Browse"
            soft="var(--accent-opportunities-soft)"
          />
        ) : (
          <ul className="min-w-0 space-y-2">
            {opportunities.map((item) => {
              const deadlineText = deadlineLabel(item.deadline);
              return (
                <li key={item.id} className="min-w-0 max-w-full">
                  <Link
                    href="/opportunities"
                    className="block min-w-0 max-w-full rounded-xl px-2 py-2 transition hover:bg-indigo-50/70 sm:px-2.5 sm:py-2.5"
                  >
                    <span className="inline-flex max-w-full truncate rounded-full bg-indigo-50 px-2 py-0.5 text-[11px] font-bold text-indigo-700">
                      {item.type}
                    </span>
                    <p className="mt-1.5 line-clamp-2 break-safe text-sm font-bold text-slate-900">
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

      <div className="border-t border-teal-900/8 px-3 py-2.5 sm:px-4 sm:py-3">
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

function CompactEmpty({
  icon,
  title,
  description,
  actionHref,
  actionLabel,
  soft,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
  actionHref: string;
  actionLabel: string;
  soft: string;
}) {
  return (
    <div className="px-1 py-6 text-center sm:py-8">
      <div
        className="mx-auto mb-3 flex h-11 w-11 items-center justify-center rounded-2xl"
        style={{ background: soft, color: "var(--brand)" }}
      >
        {icon}
      </div>
      <p className="text-sm font-bold text-slate-900">{title}</p>
      <p className="mx-auto mt-1 max-w-xs text-xs leading-relaxed text-[var(--muted)]">
        {description}
      </p>
      <Link
        href={actionHref}
        className="mt-3 inline-flex text-sm font-bold text-[var(--brand)] hover:underline"
      >
        {actionLabel} →
      </Link>
    </div>
  );
}

function TabButton({
  active,
  onClick,
  icon,
  label,
  shortLabel,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
  shortLabel: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex min-w-0 flex-1 items-center justify-center gap-1 rounded-xl px-1.5 py-2 text-[11px] font-bold transition sm:gap-1.5 sm:px-3 sm:text-sm ${
        active
          ? "bg-white text-teal-900 shadow-sm"
          : "text-slate-500 hover:text-slate-800"
      }`}
    >
      <span className="shrink-0">{icon}</span>
      <span className="truncate lg:hidden">{shortLabel}</span>
      <span className="hidden truncate lg:inline">{label}</span>
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
    <div className="mb-2.5 flex min-w-0 max-w-full flex-wrap items-end justify-between gap-x-3 gap-y-1 sm:mb-3">
      <div className="min-w-0 flex-1 overflow-hidden">
        <div className="mb-0.5 flex min-w-0 items-center gap-2 sm:mb-1">
          <span className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-[var(--accent-network-soft)] text-[var(--accent-network)]">
            <IconUsers size={14} />
          </span>
          <h2 className="section-title min-w-0 truncate">People you might know</h2>
        </div>
        <p className="text-xs text-[var(--muted)] sm:text-sm">
          From your department or batch — start a conversation.
        </p>
      </div>
      <Link
        href="/network"
        className="shrink-0 text-sm font-bold text-[var(--brand)] hover:underline"
      >
        See all →
      </Link>
    </div>
  );
}
