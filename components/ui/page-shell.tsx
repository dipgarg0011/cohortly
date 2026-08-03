import type { ReactNode } from "react";

type Accent =
  | "home"
  | "network"
  | "mentors"
  | "referrals"
  | "opportunities"
  | "messages"
  | "profile";

const ACCENT: Record<
  Accent,
  { soft: string; solid: string; blob: string }
> = {
  home: {
    soft: "var(--accent-home-soft)",
    solid: "var(--accent-home)",
    blob: "rgba(15,118,110,0.18)",
  },
  network: {
    soft: "var(--accent-network-soft)",
    solid: "var(--accent-network)",
    blob: "rgba(2,132,199,0.16)",
  },
  mentors: {
    soft: "var(--accent-mentors-soft)",
    solid: "var(--accent-mentors)",
    blob: "rgba(217,119,6,0.16)",
  },
  referrals: {
    soft: "var(--accent-referrals-soft)",
    solid: "var(--accent-referrals)",
    blob: "rgba(225,29,72,0.14)",
  },
  opportunities: {
    soft: "var(--accent-opportunities-soft)",
    solid: "var(--accent-opportunities)",
    blob: "rgba(79,70,229,0.14)",
  },
  messages: {
    soft: "var(--accent-messages-soft)",
    solid: "var(--accent-messages)",
    blob: "rgba(13,148,136,0.16)",
  },
  profile: {
    soft: "var(--accent-profile-soft)",
    solid: "var(--accent-profile)",
    blob: "rgba(71,85,105,0.14)",
  },
};

export function PageShell({
  accent = "home",
  children,
}: {
  accent?: Accent;
  children: ReactNode;
}) {
  const a = ACCENT[accent];
  return (
    <div className="relative flex min-h-full min-w-0 max-w-full flex-1 flex-col overflow-x-hidden">
      <div className="page-atmosphere" aria-hidden>
        <div
          className="absolute -left-20 -top-24 h-72 w-72 rounded-full"
          style={{ background: a.blob }}
        />
        <div
          className="absolute -right-16 top-40 h-64 w-64 rounded-full"
          style={{ background: a.soft, opacity: 0.85 }}
        />
        <div
          className="absolute bottom-10 left-1/3 h-48 w-48 rounded-full"
          style={{ background: "rgba(232,238,252,0.8)" }}
        />
      </div>
      {children}
    </div>
  );
}

export function PageHeader({
  eyebrow,
  title,
  description,
  action,
  accent = "home",
}: {
  eyebrow?: string;
  title: string;
  description?: string;
  action?: ReactNode;
  accent?: Accent;
}) {
  const a = ACCENT[accent];
  return (
    <div className="mb-6 flex flex-col gap-4 sm:mb-8 sm:flex-row sm:items-end sm:justify-between">
      <div className="min-w-0 flex-1">
        {eyebrow && (
          <p
            className="mb-2 inline-flex rounded-full px-2.5 py-1 text-[11px] font-bold uppercase tracking-wider"
            style={{ background: a.soft, color: a.solid }}
          >
            {eyebrow}
          </p>
        )}
        <h1 className="page-title">{title}</h1>
        {description && (
          <p className="mt-2 max-w-2xl text-sm leading-relaxed text-[var(--muted)] sm:text-base">
            {description}
          </p>
        )}
      </div>
      {action ? (
        <div className="w-full shrink-0 sm:w-auto">{action}</div>
      ) : null}
    </div>
  );
}
