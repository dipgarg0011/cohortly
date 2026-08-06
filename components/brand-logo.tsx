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

const WORDMARK = {
  sm: { height: 28, width: 118 },
  md: { height: 32, width: 136 },
  lg: { height: 40, width: 170 },
  hero: { height: 56, width: 236 },
} as const;

const ICON = {
  sm: { height: 28, width: 28 },
  md: { height: 36, width: 36 },
  lg: { height: 44, width: 44 },
  hero: { height: 64, width: 64 },
} as const;

/**
 * Cohortly brand mark.
 * - wordmark: full logo (C + Cohortly) — navbar, footer, auth, landing
 * - icon: mark only — favicon companion, compact UI
 *
 * Assets ship with a dark plate; we keep a matching rounded plate so they
 * read cleanly on the light page background.
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
    <span
      className={`inline-flex items-center justify-center overflow-hidden rounded-lg bg-black shadow-sm ring-1 ring-black/10 ${className}`}
      style={{
        height: dims.height,
        width: dims.width,
      }}
    >
      <Image
        src={src}
        alt={alt}
        width={dims.width}
        height={dims.height}
        priority={priority}
        className="h-full w-full object-contain"
      />
    </span>
  );

  if (href == null) return image;

  return (
    <Link
      href={href}
      className="inline-flex shrink-0 rounded-lg transition hover:opacity-90 active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand)] focus-visible:ring-offset-2"
      aria-label="Cohortly home"
    >
      {image}
    </Link>
  );
}
