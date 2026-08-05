import type { ReactNode } from "react";
import Link from "next/link";

export function PublicPage({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: ReactNode;
}) {
  return (
    <div className="relative flex min-h-full min-w-0 flex-1 flex-col overflow-x-hidden">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top,_#d8f3ee_0%,_transparent_55%),radial-gradient(ellipse_at_bottom_right,_#e8eefc_0%,_transparent_45%)]"
      />

      <header className="relative z-10 border-b border-teal-900/8 bg-white/70 backdrop-blur-xl">
        <div className="mx-auto flex h-14 w-full max-w-3xl items-center justify-between gap-3 px-4 sm:h-16 sm:px-6">
          <Link
            href="/"
            className="rounded-lg px-1 py-0.5 font-[family-name:var(--font-display)] text-lg font-bold tracking-tight text-[var(--brand)] transition hover:bg-teal-50 hover:text-[var(--brand-dark)] sm:text-xl"
          >
            Cohortly
          </Link>
          <Link
            href="/auth"
            className="text-sm font-semibold text-[var(--brand)] transition hover:text-[var(--brand-dark)] hover:underline"
          >
            Sign in
          </Link>
        </div>
      </header>

      <main className="relative z-10 mx-auto w-full min-w-0 max-w-3xl flex-1 px-4 py-8 sm:px-6 sm:py-12">
        <h1 className="page-title">{title}</h1>
        {description ? (
          <p className="mt-3 max-w-2xl text-sm leading-relaxed text-[var(--muted)] sm:text-base">
            {description}
          </p>
        ) : null}
        <div className="prose-public mt-8 space-y-5 text-sm leading-relaxed text-slate-700 sm:text-[0.9375rem] sm:leading-7">
          {children}
        </div>
      </main>
    </div>
  );
}

export function PublicSection({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <section>
      <h2 className="section-title mb-2 text-[1.15rem] sm:text-[1.25rem]">
        {title}
      </h2>
      <div className="space-y-3">{children}</div>
    </section>
  );
}
