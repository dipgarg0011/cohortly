import Link from "next/link";
import {
  IconBriefcase,
  IconMentor,
  IconMessage,
  IconReferral,
  IconUsers,
} from "@/components/ui/icons";
import {
  seeAllHrefForNeeds,
  waitedLabel,
  type NeedItem,
  type NeedType,
} from "@/lib/dashboard-needs";

const ICONS: Record<NeedType, typeof IconMessage> = {
  connection: IconUsers,
  mentorship: IconMentor,
  referral: IconReferral,
  application: IconBriefcase,
  unread_turn: IconMessage,
  followup: IconMessage,
};

type Props = {
  items: NeedItem[];
};

export function DashboardNeedsYou({ items }: Props) {
  if (items.length === 0) {
    return (
      <p className="mb-5 text-sm text-slate-500 sm:mb-6">You&apos;re all caught up.</p>
    );
  }

  const top = items.slice(0, 5);
  const seeAll = seeAllHrefForNeeds(top);

  return (
    <section className="mb-5 min-w-0 animate-fade-up sm:mb-6">
      <div className="mb-2.5 flex min-w-0 items-end justify-between gap-3">
        <h2 className="section-title">Needs you</h2>
        {items.length > 5 && (
          <Link
            href={seeAll}
            className="shrink-0 text-sm font-bold text-[var(--brand)] hover:underline"
          >
            See all →
          </Link>
        )}
      </div>
      <ul className="min-w-0 divide-y divide-slate-100 rounded-xl border border-teal-900/8 bg-white/80">
        {top.map((item) => {
          const Icon = ICONS[item.type];
          return (
            <li key={item.id} className="min-w-0">
              <div className="flex min-w-0 items-center gap-3 px-3 py-2.5 sm:px-3.5">
                <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-teal-50 text-teal-800">
                  <Icon size={14} />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-slate-900">
                    {item.text}
                  </p>
                  <p className="text-[11px] text-slate-500">
                    Waiting {waitedLabel(item.waitedAt)}
                  </p>
                </div>
                <Link
                  href={item.href}
                  className="shrink-0 rounded-lg bg-[var(--brand)] px-3 py-1.5 text-xs font-bold text-white hover:bg-[var(--brand-dark)]"
                >
                  {item.actionLabel}
                </Link>
              </div>
            </li>
          );
        })}
      </ul>
      {items.length > 5 && (
        <div className="mt-2 sm:hidden">
          <Link
            href={seeAll}
            className="text-sm font-bold text-[var(--brand)] hover:underline"
          >
            See all →
          </Link>
        </div>
      )}
    </section>
  );
}
