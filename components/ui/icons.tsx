import type { ReactNode, SVGProps } from "react";

type IconProps = SVGProps<SVGSVGElement> & { size?: number };

function base({ size = 18, className, ...props }: IconProps) {
  return {
    width: size,
    height: size,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.9,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    className,
    ...props,
  };
}

export function IconHome(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path d="M3 10.5 12 3l9 7.5" />
      <path d="M5 10v10h14V10" />
    </svg>
  );
}

export function IconUsers(props: IconProps) {
  return (
    <svg {...base(props)}>
      <circle cx="9" cy="8" r="3.2" />
      <path d="M2.8 19a6.2 6.2 0 0 1 12.4 0" />
      <circle cx="17" cy="9" r="2.4" />
      <path d="M15.2 19a4.8 4.8 0 0 1 6 0" />
    </svg>
  );
}

export function IconMentor(props: IconProps) {
  return (
    <svg {...base(props)}>
      <circle cx="12" cy="8" r="3.2" />
      <path d="M5 19a7 7 0 0 1 14 0" />
      <path d="M12 11v3" />
      <path d="M9.5 14.5 12 17l2.5-2.5" />
    </svg>
  );
}

export function IconReferral(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path d="M16 3h5v5" />
      <path d="M21 3 12 12" />
      <path d="M11 5H6a3 3 0 0 0-3 3v10a3 3 0 0 0 3 3h10a3 3 0 0 0 3-3v-5" />
    </svg>
  );
}

export function IconBriefcase(props: IconProps) {
  return (
    <svg {...base(props)}>
      <rect x="3" y="7" width="18" height="13" rx="2" />
      <path d="M8 7V5a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
      <path d="M3 12h18" />
    </svg>
  );
}

export function IconMessage(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path d="M21 11.5a8.5 8.5 0 0 1-12.4 7.5L3 21l2.1-5.1A8.5 8.5 0 1 1 21 11.5z" />
    </svg>
  );
}

export function IconUser(props: IconProps) {
  return (
    <svg {...base(props)}>
      <circle cx="12" cy="8" r="3.5" />
      <path d="M5 19a7 7 0 0 1 14 0" />
    </svg>
  );
}

export function IconBell(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path d="M6 9a6 6 0 1 1 12 0c0 7 3 7 3 7H3s3 0 3-7" />
      <path d="M10 19a2 2 0 0 0 4 0" />
    </svg>
  );
}

export function IconSpark(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path d="M12 3v4" />
      <path d="M12 17v4" />
      <path d="M3 12h4" />
      <path d="M17 12h4" />
      <path d="m6 6 2.5 2.5" />
      <path d="m15.5 15.5 2.5 2.5" />
      <path d="m18 6-2.5 2.5" />
      <path d="m8.5 15.5-2.5 2.5" />
    </svg>
  );
}

export function IconChatEmpty(props: IconProps) {
  return (
    <svg {...base({ size: 40, ...props })}>
      <path d="M5 7a3 3 0 0 1 3-3h8a3 3 0 0 1 3 3v6a3 3 0 0 1-3 3h-4l-4 3v-3H8a3 3 0 0 1-3-3z" />
      <path d="M9 10h6" />
      <path d="M9 13h3.5" />
    </svg>
  );
}

export function IconNetworkEmpty(props: IconProps) {
  return (
    <svg {...base({ size: 40, ...props })}>
      <circle cx="8" cy="8" r="2.5" />
      <circle cx="16" cy="7" r="2.5" />
      <circle cx="12" cy="16" r="2.5" />
      <path d="M10 9.5 14 8.2" />
      <path d="M9.2 10.2 11 14" />
      <path d="M14.8 9.5 13 14" />
    </svg>
  );
}

export function IconMentorEmpty(props: IconProps) {
  return (
    <svg {...base({ size: 40, ...props })}>
      <circle cx="12" cy="8" r="3" />
      <path d="M5 18a7 7 0 0 1 14 0" />
      <path d="M12 11v5" />
      <path d="m9 14 3 3 3-3" />
    </svg>
  );
}

export function IconOpportunityEmpty(props: IconProps) {
  return (
    <svg {...base({ size: 40, ...props })}>
      <rect x="4" y="8" width="16" height="11" rx="2" />
      <path d="M9 8V6a3 3 0 0 1 6 0v2" />
      <path d="M4 13h16" />
    </svg>
  );
}

export function IconReferralEmpty(props: IconProps) {
  return (
    <svg {...base({ size: 40, ...props })}>
      <path d="M7 17V7a2 2 0 0 1 2-2h6" />
      <path d="M15 5h4v4" />
      <path d="m19 5-7 7" />
      <path d="M7 17h10a2 2 0 0 0 2-2" />
    </svg>
  );
}

export function FeatureIconBubble({
  accent,
  children,
}: {
  accent: string;
  children: ReactNode;
}) {
  return (
    <span
      className="inline-flex h-11 w-11 items-center justify-center rounded-2xl"
      style={{ background: accent, color: "var(--foreground)" }}
    >
      {children}
    </span>
  );
}
