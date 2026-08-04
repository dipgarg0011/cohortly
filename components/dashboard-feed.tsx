"use client";

import Link from "next/link";
import { useState } from "react";
import { SectionCard } from "@/components/ui/section-card";
import { PersonAvatar } from "@/components/ui/person-avatar";
import { ProfilePreviewTrigger } from "@/components/profile-preview";
import {
  IconBriefcase,
  IconChatEmpty,
  IconMessage,
  IconOpportunityEmpty,
  IconUsers,
} from "@/components/ui/icons";
import {
  formatAbsoluteTime,
  formatRelativeTime,
} from "@/lib/format-time";
import type { Conversation } from "@/lib/messages";
import { deadlineLabel } from "@/lib/referrals";
import type { Opportunity } from "@/lib/opportunities";
import { SectionHeader } from "@/components/ui/section-header";
import { compactDisplayName } from "@/lib/display-name";

type Props = {
  conversations: Conversation[];
  opportunities: Opportunity[];
  currentUserId: string;
};

/** Shared header band so People title and Messages tabs sit in the same strip. */
export const DASHBOARD_PAIR_HEADER =
  "flex h-[5.5rem] shrink-0 items-center overflow-hidden border-b border-slate-100 px-4 py-3 sm:px-5";

export const DASHBOARD_PAIR_FOOTER =
  "flex h-[3.25rem] shrink-0 items-center border-t border-slate-100 px-4 sm:px-5";

export const DASHBOARD_PAIR_CARD =
  "flex h-full min-h-0 w-full min-w-0 max-w-full flex-col overflow-hidden !p-0 lg:min-h-[26rem]";

export function DashboardFeed({
  conversations,
  opportunities,
  currentUserId,
}: Props) {
  const [tab, setTab] = useState<"messages" | "opportunities">("messages");

  return (
    <SectionCard stagger={4} className={DASHBOARD_PAIR_CARD}>
      <div className={DASHBOARD_PAIR_HEADER}>
        <div
          className="flex w-full min-w-0 gap-1 rounded-xl bg-slate-100/90 p-1"
          role="tablist"
          aria-label="Feed"
        >
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
      </div>

      <div className="min-h-0 min-w-0 max-w-full flex-1 overflow-x-clip overflow-y-auto px-2.5 py-2 sm:px-3 sm:py-2.5">
        {tab === "messages" ? (
          conversations.length === 0 ? (
            <CompactEmpty
              icon={<IconChatEmpty />}
              title="Your inbox is waiting"
              description="Say hi to someone in the Network."
              actionHref="/network"
              actionLabel="Find people"
            />
          ) : (
            <ul className="min-w-0 max-w-full space-y-0.5">
              {conversations.map((convo) => {
                const fullName =
                  convo.partner.full_name?.trim() || "Unnamed member";
                const name = compactDisplayName(convo.partner.full_name);
                const unread = convo.unreadCount > 0;
                const preview = `${
                  convo.lastMessage.sender_id === currentUserId ? "You: " : ""
                }${convo.lastMessage.content}`;
                return (
                  <li
                    key={convo.partner.id}
                    className={`flex min-w-0 max-w-full items-center gap-2.5 rounded-xl px-2 py-1.5 transition-[transform,box-shadow] duration-150 hover:-translate-y-px sm:gap-3 sm:px-2.5 sm:py-2 ${
                      unread
                        ? "bg-[var(--accent-home-soft)]/70"
                        : "hover:bg-slate-50"
                    }`}
                  >
                    <ProfilePreviewTrigger
                      userId={convo.partner.id}
                      className="shrink-0"
                    >
                      <PersonAvatar
                        id={convo.partner.id}
                        name={convo.partner.full_name}
                        url={convo.partner.avatar_url}
                        size="sm"
                      />
                    </ProfilePreviewTrigger>
                    <div className="min-w-0 flex-1 overflow-hidden">
                      <div className="flex min-w-0 items-center gap-2 leading-5">
                        <span className="flex min-w-0 flex-1 items-center gap-1.5 overflow-hidden">
                          {unread && (
                            <span
                              aria-hidden
                              className="h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--brand)]"
                            />
                          )}
                          <ProfilePreviewTrigger
                            userId={convo.partner.id}
                            className="block min-w-0 flex-1 overflow-hidden"
                          >
                            <span
                              title={fullName}
                              className={`block min-w-0 truncate text-sm leading-5 ${
                                unread
                                  ? "font-extrabold text-slate-950"
                                  : "font-semibold text-slate-800"
                              }`}
                            >
                              {name}
                            </span>
                          </ProfilePreviewTrigger>
                        </span>
                        <Link
                          href={`/messages?with=${convo.partner.id}`}
                          className="meta-text shrink-0 leading-5 hover:text-[var(--brand)]"
                          title={formatAbsoluteTime(
                            convo.lastMessage.created_at,
                          )}
                        >
                          {formatRelativeTime(convo.lastMessage.created_at)}
                        </Link>
                      </div>
                      <Link
                        href={`/messages?with=${convo.partner.id}`}
                        title={preview}
                        className="mt-0.5 block min-w-0 max-w-full overflow-hidden truncate text-xs leading-4 text-slate-500 hover:text-slate-700"
                      >
                        {preview}
                      </Link>
                    </div>
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
          />
        ) : (
          <ul className="min-w-0 space-y-1">
            {opportunities.map((item) => {
              const deadlineText = deadlineLabel(item.deadline);
              return (
                <li key={item.id} className="min-w-0 max-w-full">
                  <Link
                    href="/opportunities"
                    className="block min-w-0 max-w-full rounded-xl px-2 py-1.5 transition-[transform,box-shadow] duration-150 hover:-translate-y-px hover:bg-[var(--brand-soft)]/50 sm:px-2.5 sm:py-2"
                  >
                    <span className="inline-flex max-w-full truncate rounded-full bg-[var(--brand-soft)] px-2 py-0.5 text-[11px] font-bold text-[var(--brand-dark)]">
                      {item.type}
                    </span>
                    <p className="mt-1 truncate text-sm font-bold text-slate-900">
                      {item.title}
                    </p>
                    {item.company?.trim() && (
                      <p className="mt-0.5 truncate text-xs text-slate-500">
                        {item.company.trim()}
                      </p>
                    )}
                    {deadlineText && (
                      <p className="mt-1 text-xs font-semibold text-[var(--brand)]">
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

      <div className={DASHBOARD_PAIR_FOOTER}>
        <Link
          href={tab === "messages" ? "/messages" : "/opportunities"}
          className="text-sm font-bold text-[var(--brand)] hover:underline"
        >
          {tab === "messages" ? "View all messages" : "View all opportunities"} →
        </Link>
      </div>
    </SectionCard>
  );
}

function CompactEmpty({
  icon,
  title,
  description,
  actionHref,
  actionLabel,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
  actionHref: string;
  actionLabel: string;
}) {
  return (
    <div className="px-1 py-6 text-center sm:py-8">
      <div className="mx-auto mb-3 flex h-11 w-11 items-center justify-center rounded-2xl bg-[var(--brand-soft)] text-[var(--brand)]">
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
      role="tab"
      aria-selected={active}
      onClick={onClick}
      className={`relative flex min-w-0 flex-1 items-center justify-center gap-1 rounded-lg px-1.5 py-2 text-[11px] font-bold transition-[transform,box-shadow] duration-150 sm:gap-1.5 sm:px-3 sm:text-sm ${
        active
          ? "bg-white text-slate-900 shadow-sm"
          : "text-slate-500 hover:text-slate-700"
      }`}
    >
      <span
        className="shrink-0"
        style={{ color: active ? "var(--brand)" : undefined }}
      >
        {icon}
      </span>
      <span className="truncate lg:hidden">{shortLabel}</span>
      <span className="hidden truncate lg:inline">{label}</span>
      {active && (
        <span
          className="absolute inset-x-3 -bottom-px h-0.5 rounded-full bg-[var(--brand)]"
          aria-hidden
        />
      )}
    </button>
  );
}

export function PeoplePreviewHeader() {
  return (
    <SectionHeader
      title="People you might know"
      subtitle="From your department or batch — start a conversation."
      accent="home"
      icon={<IconUsers size={16} />}
      className="mb-0 w-full"
    />
  );
}
