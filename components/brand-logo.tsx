import Image from "next/image";
import Link from "next/link";

type BrandLogoProps = {
  href?: string | null;
  /** Wordmark for headers; icon-only for compact spots */
  variant?: "wordmark" | "icon";
  /** Visual size preset */
  size?: "sm" | "md" | "lg" | "hero";
  className?: string;
  priority?: boolean;
};

/** Wordmark asset ~819×304 (~2.7:1) — sized to read clearly in chrome */
const WORDMARK = {
  sm: { height: 36, width: 98 },
  md: { height: 44, width: 120 },
  lg: { height: 52, width: 142 },
  hero: { height: 72, width: 196 },
} as const;

const ICON = {
  sm: { height: 36, width: 36 },
  md: { height: 44, width: 44 },
  lg: { height: 52, width: 52 },
  hero: { height: 72, width: 72 },
} as const;

/**
 * Cohortly brand mark.
 * - wordmark: full logo — navbar, footer, auth, landing
 * - icon: mark only — favicon companion, tight mobile
 */
export function BrandLogo({
  href = "/",
  variant = "wordmark",
  size = "md",
  className = "",
  priority = false,
}: BrandLogoProps) {
  const dims = variant === "icon" ? ICON[size] : WORDMARK[size];
  const src =
    variant === "icon" ? "/cohortly-icon.png" : "/cohortly-logo.png";

  const image = (
    <Image
      src={src}
      alt="Cohortly"
      width={dims.width}
      height={dims.height}
      priority={priority}
      className={`block object-contain object-left ${className}`}
      style={{ height: dims.height, width: "auto" }}
    />
  );

  const shellClass =
    "inline-flex shrink-0 items-center justify-center leading-none";

  if (href == null) {
    return (
      <span className={shellClass} style={{ height: dims.height }}>
        {image}
      </span>
    );
  }

  return (
    <Link
      href={href}
      className={`${shellClass} rounded-md transition hover:opacity-90 active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand)] focus-visible:ring-offset-2`}
      aria-label="Cohortly home"
      style={{ height: dims.height }}
    >
      {image}
    </Link>
  );
}
