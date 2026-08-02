import type { ReactNode } from "react";

type Props = {
  children: ReactNode;
  className?: string;
  interactive?: boolean;
  as?: "div" | "article" | "li" | "section";
};

export function SurfaceCard({
  children,
  className = "",
  interactive = false,
  as: Tag = "div",
}: Props) {
  return (
    <Tag
      className={`surface-card ${interactive ? "surface-card-interactive" : ""} ${className}`}
    >
      {children}
    </Tag>
  );
}
