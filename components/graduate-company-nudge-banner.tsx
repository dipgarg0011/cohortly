import Link from "next/link";
import { GRADUATE_COMPANY_TIP } from "@/lib/profile-completion";

/**
 * Persistent dashboard nudge for graduates with empty `profiles.company`.
 * Stays until company is set — not a dismissible toast.
 */
export function GraduateCompanyNudgeBanner() {
  return (
    <div
      className="mb-4 flex min-w-0 flex-col gap-2 rounded-xl border border-teal-900/10 bg-teal-50/80 px-3 py-2.5 animate-fade-up sm:mb-6 sm:flex-row sm:items-center sm:gap-3"
      role="status"
    >
      <p className="min-w-0 flex-1 text-sm text-teal-950">{GRADUATE_COMPANY_TIP}</p>
      <Link
        href="/profile#company"
        className="shrink-0 self-start text-sm font-bold text-[var(--brand)] hover:underline sm:self-center"
      >
        Add company →
      </Link>
    </div>
  );
}
