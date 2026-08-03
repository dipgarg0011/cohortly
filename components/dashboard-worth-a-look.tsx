import Link from "next/link";
import { IconSpark } from "@/components/ui/icons";
import { SectionCard } from "@/components/ui/section-card";
import { SectionHeader } from "@/components/ui/section-header";
import type { LookItem } from "@/lib/dashboard-look";

type Props = {
  items: LookItem[];
};

export function DashboardWorthALook({ items }: Props) {
  if (items.length === 0) return null;

  return (
    <SectionCard stagger={2} className="mb-5 sm:mb-6">
      <SectionHeader
        title="Worth a look"
        subtitle="Fresh things that might matter this week"
        accent="home"
        icon={<IconSpark size={16} />}
      />
      <ul className="min-w-0 space-y-2">
        {items.map((item) => (
          <li key={item.id} className="min-w-0">
            <Link
              href={item.href}
              className="flex min-w-0 items-center gap-3 rounded-xl border border-slate-100 bg-slate-50/70 px-3 py-2.5 transition-[transform,box-shadow] duration-150 hover:-translate-y-px hover:bg-white hover:shadow-[var(--shadow)] sm:px-3.5"
            >
              <p className="min-w-0 flex-1 truncate text-sm font-semibold text-slate-900">
                {item.text}
              </p>
              <span className="shrink-0 text-xs font-bold text-[var(--brand)]">
                {item.actionLabel} →
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </SectionCard>
  );
}
