import type { ReactNode } from "react";
import Link from "next/link";
import { BackToTopButton } from "@/components/back-to-top";

export type TocItem = {
  id: string;
  label: string;
};

export function ContentPage({
  title,
  description,
  lastUpdated,
  toc,
  showBackToTop = true,
  children,
}: {
  title: string;
  description?: string;
  lastUpdated?: string;
  toc?: TocItem[];
  showBackToTop?: boolean;
  children: ReactNode;
}) {
  return (
    <div className="relative flex min-h-full min-w-0 flex-1 flex-col overflow-x-hidden">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top,_#d8f3ee_0%,_transparent_55%),radial-gradient(ellipse_at_bottom_right,_#e8eefc_0%,_transparent_45%)]"
      />

      <header className="relative z-10 border-b border-teal-900/8 bg-white/70 backdrop-blur-xl">
        <div className="mx-auto flex h-14 w-full max-w-[70ch] items-center justify-between gap-3 px-4 sm:h-16 sm:px-6">
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

      <main
        id="top"
        className="relative z-10 mx-auto w-full min-w-0 max-w-[70ch] flex-1 px-4 py-8 sm:px-6 sm:py-12"
      >
        <h1 className="page-title">{title}</h1>
        {description ? (
          <p className="mt-3 text-base leading-relaxed text-[var(--muted)] sm:text-[1.05rem] sm:leading-7">
            {description}
          </p>
        ) : null}
        {lastUpdated ? (
          <p className="mt-4 text-xs font-medium uppercase tracking-wider text-slate-500">
            Last updated: {lastUpdated}
          </p>
        ) : null}

        {toc && toc.length > 0 ? (
          <nav
            aria-label="On this page"
            className="mt-8 rounded-xl border border-teal-900/8 bg-white/70 px-4 py-4 sm:px-5"
          >
            <p className="text-xs font-semibold uppercase tracking-wider text-slate-600">
              On this page
            </p>
            <ol className="mt-3 space-y-1.5 text-sm leading-relaxed">
              {toc.map((item, index) => (
                <li key={item.id}>
                  <a
                    href={`#${item.id}`}
                    className="text-slate-700 transition hover:text-[var(--brand)] hover:underline"
                  >
                    <span className="tabular-nums text-slate-400">
                      {index + 1}.
                    </span>{" "}
                    {item.label}
                  </a>
                </li>
              ))}
            </ol>
          </nav>
        ) : null}

        <div className="mt-10 space-y-10 text-[0.975rem] leading-[1.75] text-slate-700 sm:text-base sm:leading-[1.8]">
          {children}
        </div>

        {showBackToTop ? (
          <div className="mt-12 border-t border-teal-900/8 pt-6">
            <a
              href="#top"
              className="text-sm font-semibold text-[var(--brand)] transition hover:text-[var(--brand-dark)] hover:underline"
            >
              Back to top
            </a>
          </div>
        ) : null}
      </main>

      {showBackToTop ? <BackToTopButton /> : null}
    </div>
  );
}

export function ContentSection({
  id,
  number,
  title,
  children,
}: {
  id: string;
  number?: number;
  title: string;
  children: ReactNode;
}) {
  return (
    <section id={id} className="scroll-mt-20">
      <h2 className="section-title mb-3 text-[1.2rem] sm:text-[1.35rem]">
        {number != null ? (
          <span className="mr-2 tabular-nums text-slate-400">{number}.</span>
        ) : null}
        {title}
      </h2>
      <div className="space-y-3.5 [&_a]:font-semibold [&_a]:text-[var(--brand)] [&_a]:hover:text-[var(--brand-dark)] [&_a]:hover:underline [&_h3]:mt-5 [&_h3]:font-[family-name:var(--font-display)] [&_h3]:text-base [&_h3]:font-bold [&_h3]:tracking-tight [&_h3]:text-slate-900 [&_li]:leading-[1.75] [&_ul]:list-disc [&_ul]:space-y-2 [&_ul]:pl-5">
        {children}
      </div>
    </section>
  );
}
