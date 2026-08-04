import Link from "next/link";
import {
  IconBriefcase,
  IconMentor,
  IconMessage,
  IconReferral,
  IconUsers,
} from "@/components/ui/icons";
import { SectionCard } from "@/components/ui/section-card";
import { SectionHeader } from "@/components/ui/section-header";
import {
  seeAllHrefForNeeds,
  waitedLabel,
  type NeedItem,
  type NeedType,
} from "@/lib/dashboard-needs";
import type { CaughtUpNudge } from "@/lib/dashboard-nudge";
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

type Props = {
  items: NeedItem[];
  /** When needs are empty — one suggested action (never also show profile tip banner). */
  emptySuggestion?: CaughtUpNudge | null;
};

export function DashboardNeedsYou({ items, emptySuggestion = null }: Props) {
  if (items.length === 0) {
    if (emptySuggestion) {
      return (
        <SectionCard stagger={1} className="@container/nudge mb-5 sm:mb-6">
          <div className="flex min-w-0 flex-col items-stretch gap-2 @[24rem]/nudge:flex-row @[24rem]/nudge:items-center @[24rem]/nudge:justify-between @[24rem]/nudge:gap-3">
            <p className="min-w-0 flex-1 line-clamp-2 text-sm leading-snug text-slate-600">
              {emptySuggestion.text}
            </p>
            <Link
              href={emptySuggestion.href}
              className="shrink-0 self-start text-sm font-bold text-[var(--brand)] hover:underline @[24rem]/nudge:self-center"
            >
              {emptySuggestion.actionLabel} →
            </Link>
          </div>
        </SectionCard>
      );
    }

    return (
      <p className="mb-5 text-sm text-slate-500 stagger-1 sm:mb-6">
        You&apos;re all caught up.
      </p>
    );
  }

  const top = items.slice(0, 5);
  const seeAll = seeAllHrefForNeeds(top);

  return (
    <SectionCard stagger={1} className="mb-5 sm:mb-6">
      <SectionHeader
        title="Needs you"
        accent="home"
        icon={<IconUsers size={16} />}
        actionHref={items.length > 5 ? seeAll : undefined}
        actionLabel={items.length > 5 ? "See all →" : undefined}
      />
      <ul className="min-w-0 space-y-1.5">
        {top.map((item) => {
          const Icon = ICONS[item.type];
          return (
            <li key={item.id} className="min-w-0">
              <div className="flex min-w-0 items-center gap-3 rounded-xl px-1 py-1.5 sm:px-1.5">
                <span
                  className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl"
                  style={{
                    background: ICON_SOFT[item.type],
                    color: ICON_SOLID[item.type],
                  }}
                >
                  <Icon size={14} />
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
                  </p>
                </div>
                <Link
                  href={item.href}
                  className="shrink-0 rounded-lg bg-[var(--brand)] px-3 py-1.5 text-xs font-bold text-white transition-[transform,box-shadow] duration-150 hover:-translate-y-px hover:bg-[var(--brand-dark)]"
                >
                  {item.actionLabel}
                </Link>
              </div>
            </li>
          );
        })}
      </ul>
    </SectionCard>
  );
}
