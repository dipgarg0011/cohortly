import type { ReactNode } from "react";
import Link from "next/link";
import { SectionCard } from "@/components/ui/section-card";
import { SectionHeader } from "@/components/ui/section-header";
import { SurfaceCard } from "@/components/ui/surface-card";
import {
  IconBriefcase,
  IconMessage,
  IconSpark,
  IconUsers,
} from "@/components/ui/icons";
import type { CommunityStats } from "@/lib/dashboard-community";

type Props = {
  stats: CommunityStats;
  unreadCount: number;
};

type CommunityCard = {
  key: string;
  href: string;
  value: number;
  label: string;
  subtitle?: string | null;
  icon: ReactNode;
  soft: string;
  solid: string;
};

export function DashboardCommunity({ stats, unreadCount }: Props) {
  const cards: CommunityCard[] = [
    {
      key: "community",
      href: "/network",
      value: stats.total,
      label: "IIT BHU community",
      icon: <IconUsers size={16} />,
      soft: "var(--brand-soft)",
      solid: "var(--brand)",
    },
    {
      key: "batch",
      href:
        stats.batchYear != null
          ? `/network?batch=${stats.batchYear}`
          : "/network",
      value: stats.yourBatch,
      label: "Your batch",
      subtitle: stats.batchYear != null ? `Batch ${stats.batchYear}` : null,
      icon: <IconSpark size={16} />,
      soft: "var(--brand-soft)",
      solid: "var(--brand)",
    },
    {
      key: "branch",
      href: stats.department
        ? `/network?dept=${encodeURIComponent(stats.department)}`
        : "/network",
      value: stats.yourBranch,
      label: "Your branch",
      subtitle: stats.department,
      icon: <IconBriefcase size={16} />,
      soft: "var(--brand-soft)",
      solid: "var(--brand)",
    },
    {
      key: "unread",
      href: "/messages",
      value: unreadCount,
      label: "Unread messages",
      icon: <IconMessage size={16} />,
      soft: "var(--brand-soft)",
      solid: "var(--brand)",
    },
  ];

  return (
    <SectionCard stagger={2} className="mb-5 sm:mb-6">
      <SectionHeader
        title="Community"
        accent="home"
        icon={<IconUsers size={16} />}
        actionHref="/network"
        actionLabel="Browse all →"
      />

      <div className="mt-4 -mx-1 flex snap-x snap-mandatory gap-2.5 overflow-x-auto px-1 pb-1 [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden md:mx-0 md:grid md:snap-none md:grid-cols-2 md:overflow-visible md:px-0 md:pb-0 lg:grid-cols-4">
        {cards.map((card) => (
          <Link
            key={card.key}
            href={card.href}
            className="block min-w-0 shrink-0 basis-[70%] snap-start md:w-full md:basis-auto md:shrink"
          >
            <SurfaceCard interactive className="h-full p-3.5 sm:p-4">
              <div
                className="mb-2 inline-flex h-8 w-8 items-center justify-center rounded-xl"
                style={{ background: card.soft, color: card.solid }}
              >
                {card.icon}
              </div>
              <p className="font-[family-name:var(--font-display)] text-2xl font-bold tabular-nums text-slate-900 sm:text-3xl">
                {card.value}
              </p>
              <p className="mt-0.5 text-xs font-semibold text-slate-500">
                {card.label}
              </p>
              {card.subtitle ? (
                <p
                  className="mt-0.5 text-[11px] font-semibold"
                  style={{ color: card.solid }}
                >
                  {card.subtitle}
                </p>
              ) : null}
            </SurfaceCard>
          </Link>
        ))}
      </div>
    </SectionCard>
  );
}
