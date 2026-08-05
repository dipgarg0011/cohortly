import type { ReactNode } from "react";
import Link from "next/link";
import { SectionCard } from "@/components/ui/section-card";
import { SectionHeader } from "@/components/ui/section-header";
import { SurfaceCard } from "@/components/ui/surface-card";
import {
  IconBriefcase,
  IconCalendar,
  IconGradCap,
  IconUsers,
} from "@/components/ui/icons";
import type { CommunityStats } from "@/lib/dashboard-community";
import { getCollegeCommunityLabel } from "@/lib/college-display";

type Props = {
  stats: CommunityStats;
  /** College name from DB when multi-college is live; omitted until then. */
  collegeName?: string | null;
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

export function DashboardCommunity({ stats, collegeName }: Props) {
  const cards: CommunityCard[] = [
    {
      key: "community",
      href: "/network",
      value: stats.total,
      label: getCollegeCommunityLabel(collegeName),
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
      icon: <IconCalendar size={16} />,
      soft: "var(--accent-network-soft)",
      solid: "var(--accent-network)",
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
      soft: "var(--accent-opportunities-soft)",
      solid: "var(--accent-opportunities)",
    },
    {
      key: "graduates",
      href: "/network?status=graduate",
      value: stats.graduates,
      label: "Graduates",
      icon: <IconGradCap size={16} />,
      soft: "var(--accent-mentors-soft)",
      solid: "var(--accent-mentors)",
    },
  ];

  return (
    <SectionCard stagger={2} className="mb-5 overflow-visible sm:mb-6">
      <SectionHeader
        title="Community"
        accent="home"
        icon={<IconUsers size={16} />}
        actionHref="/network"
        actionLabel="Browse all →"
      />

      {/* pt/pb so hover translateY is not clipped by ancestor overflow-x-clip */}
      <div className="mt-3 grid grid-cols-2 gap-2 pt-1 pb-0.5 sm:mt-4 sm:gap-2.5 lg:grid-cols-4">
        {cards.map((card) => (
          <Link key={card.key} href={card.href} className="block min-w-0">
            <SurfaceCard interactive className="h-full p-2.5 sm:p-3.5 md:p-4">
              <div
                className="mb-1.5 inline-flex h-7 w-7 items-center justify-center rounded-lg sm:mb-2 sm:h-8 sm:w-8 sm:rounded-xl"
                style={{ background: card.soft, color: card.solid }}
              >
                {card.icon}
              </div>
              <p className="font-[family-name:var(--font-display)] text-xl font-bold tabular-nums text-slate-900 sm:text-2xl md:text-3xl">
                {card.value}
              </p>
              <p className="mt-0.5 text-[11px] font-semibold leading-snug text-slate-500 sm:text-xs">
                {card.label}
              </p>
              {card.subtitle ? (
                <p
                  className="mt-0.5 truncate text-[10px] font-semibold sm:text-[11px]"
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
