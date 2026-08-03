import Link from "next/link";
import type { LookItem } from "@/lib/dashboard-look";

type Props = {
  items: LookItem[];
};

export function DashboardWorthALook({ items }: Props) {
  if (items.length === 0) return null;

  return (
    <section className="mb-5 min-w-0 animate-fade-up sm:mb-6">
      <h2 className="section-title mb-2.5">Worth a look</h2>
      <ul className="min-w-0 space-y-1.5">
        {items.map((item) => (
          <li key={item.id} className="min-w-0">
            <Link
              href={item.href}
              className="flex min-w-0 items-center gap-3 rounded-xl border border-teal-900/8 bg-white/70 px-3 py-2.5 transition hover:border-teal-200 hover:bg-teal-50/50 sm:px-3.5"
            >
              <p className="min-w-0 flex-1 truncate text-sm font-medium text-slate-900">
                {item.text}
              </p>
              <span className="shrink-0 text-xs font-bold text-[var(--brand)]">
                {item.actionLabel} →
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
