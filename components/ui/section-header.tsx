import type { ReactNode } from "react";
import Link from "next/link";

type AccentKey =
  | "home"
  | "network"
  | "mentors"
  | "referrals"
  | "opportunities"
  | "messages"
  | "profile";

const ACCENT_VARS: Record<AccentKey, { soft: string; solid: string }> = {
  home: { soft: "var(--accent-home-soft)", solid: "var(--accent-home)" },
  network: {
    soft: "var(--accent-network-soft)",
    solid: "var(--accent-network)",
  },
  mentors: {
    soft: "var(--accent-mentors-soft)",
    solid: "var(--accent-mentors)",
  },
  referrals: {
    soft: "var(--accent-referrals-soft)",
    solid: "var(--accent-referrals)",
  },
  opportunities: {
    soft: "var(--accent-opportunities-soft)",
    solid: "var(--accent-opportunities)",
  },
  messages: {
    soft: "var(--accent-messages-soft)",
    solid: "var(--accent-messages)",
  },
  profile: {
    soft: "var(--accent-profile-soft)",
    solid: "var(--accent-profile)",
  },
};

type Props = {
  title: string;
  subtitle?: string;
  icon?: ReactNode;
  accent?: AccentKey;
  actionHref?: string;
  actionLabel?: string;
  className?: string;
};

export function SectionHeader({
  title,
  subtitle,
  icon,
  accent = "home",
  actionHref,
  actionLabel,
  className = "",
}: Props) {
  const a = ACCENT_VARS[accent];
  return (
    <div
      className={`flex min-w-0 max-w-full flex-wrap items-start justify-between gap-x-3 gap-y-2 ${className}`}
    >
      <div className="min-w-0 flex-1">
        <div className="flex min-w-0 items-center gap-2.5">
          {icon ? (
            <span
              className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl"
              style={{ background: a.soft, color: a.solid }}
            >
              {icon}
            </span>
          ) : null}
          <h2 className="section-title min-w-0 break-safe">{title}</h2>
        </div>
        {subtitle ? (
          <p className="section-subtitle mt-1 min-w-0 break-safe pl-0 sm:pl-11">
            {subtitle}
          </p>
        ) : null}
      </div>
      {actionHref && actionLabel ? (
        <Link
          href={actionHref}
          className="shrink-0 self-center text-sm font-bold hover:underline"
          style={{ color: a.solid }}
        >
          {actionLabel}
        </Link>
      ) : null}
    </div>
  );
}
