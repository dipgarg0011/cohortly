import type { ReactNode } from "react";

type Props = {
  children: ReactNode;
  className?: string;
  interactive?: boolean;
  as?: "div" | "article" | "li" | "section";
  /** Extra top stagger delay index for entrance animation */
  stagger?: number;
};

/**
 * Solid white section/card surface — lifts off the tinted page background.
 * Prefer this for major dashboard sections.
 */
export function SectionCard({
  children,
  className = "",
  interactive = false,
  as: Tag = "section",
  stagger,
}: Props) {
  const staggerClass =
    stagger != null ? `stagger-${Math.min(Math.max(stagger, 1), 6)}` : "";
  return (
    <Tag
      className={`section-card min-w-0 max-w-full ${interactive ? "section-card-interactive" : ""} ${staggerClass} ${className}`}
    >
      {children}
    </Tag>
  );
}
