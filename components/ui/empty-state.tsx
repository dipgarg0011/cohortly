import Link from "next/link";
import type { ReactNode } from "react";

type Props = {
  icon: ReactNode;
  title: string;
  description: string;
  actionHref?: string;
  actionLabel?: string;
  onAction?: () => void;
  accentSoft?: string;
};

export function EmptyState({
  icon,
  title,
  description,
  actionHref,
  actionLabel,
  onAction,
  accentSoft = "var(--brand-soft)",
}: Props) {
  return (
    <div className="surface-card animate-fade-up px-4 py-8 text-center sm:px-8 sm:py-12 lg:px-10 lg:py-14">
      <div
        className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-3xl"
        style={{ background: accentSoft, color: "var(--brand)" }}
      >
        {icon}
      </div>
      <h3 className="section-title">{title}</h3>
      <p className="mx-auto mt-2 max-w-md text-sm leading-relaxed text-[var(--muted)]">
        {description}
      </p>
      {(actionHref || onAction) && actionLabel && (
        <div className="mt-6">
          {actionHref ? (
            <Link href={actionHref} className="btn-primary">
              {actionLabel}
            </Link>
          ) : (
            <button type="button" onClick={onAction} className="btn-primary">
              {actionLabel}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
