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

/** Wordmark asset is ~819×304 (~2.7:1) */
const WORDMARK = {
  sm: { height: 28, width: 76 },
  md: { height: 32, width: 86 },
  lg: { height: 40, width: 108 },
  hero: { height: 56, width: 151 },
} as const;

const ICON = {
  sm: { height: 28, width: 28 },
  md: { height: 36, width: 36 },
  lg: { height: 44, width: 44 },
  hero: { height: 64, width: 64 },
} as const;

/**
 * Cohortly brand mark.
 * - wordmark: full logo — navbar, footer, auth, landing
 * - icon: mark only — favicon companion, compact mobile nav
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
  const alt = "Cohortly";

  const image = (
    <Image
      src={src}
      alt={alt}
      width={dims.width}
      height={dims.height}
      priority={priority}
      className={`h-auto w-auto object-contain ${className}`}
      style={{ height: dims.height, width: "auto", maxWidth: dims.width }}
    />
  );

  if (href == null) {
    return (
      <span className="inline-flex shrink-0 items-center" style={{ height: dims.height }}>
        {image}
      </span>
    );
  }

  return (
    <Link
      href={href}
      className="inline-flex shrink-0 items-center rounded-md transition hover:opacity-90 active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand)] focus-visible:ring-offset-2"
      aria-label="Cohortly home"
      style={{ height: dims.height }}
    >
      {image}
    </Link>
  );
}
