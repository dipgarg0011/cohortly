"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const NAV_LINKS = [
  { href: "/about", label: "About" },
  { href: "/privacy", label: "Privacy" },
  { href: "/terms", label: "Terms" },
  { href: "/guidelines", label: "Guidelines" },
  { href: "/contact", label: "Contact" },
] as const;

const linkClass =
  "text-[var(--muted)] transition hover:text-[var(--brand)]";

export function SiteFooter() {
  const pathname = usePathname();

  const hideFooter =
    pathname === "/messages" || pathname.startsWith("/messages/");

  if (hideFooter) return null;

  const year = new Date().getFullYear();

  return (
    <footer className="mt-auto border-t border-teal-900/8 bg-[#e4ebe9]">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-2 px-4 py-3 sm:h-[64px] sm:flex-row sm:items-center sm:justify-between sm:gap-4 sm:px-6 sm:py-0">
        <div className="hidden min-w-0 items-baseline gap-2.5 sm:flex">
          <Link
            href="/"
            className="shrink-0 font-[family-name:var(--font-display)] text-sm font-bold tracking-tight text-[var(--brand)] transition hover:text-[var(--brand-dark)]"
          >
            Cohortly
          </Link>
          <span className="text-xs text-[var(--muted)]">
            © {year} Cohortly
          </span>
        </div>

        <nav
          aria-label="Footer"
          className="flex flex-wrap items-center justify-center gap-x-0 gap-y-1 text-xs sm:justify-center"
        >
          {NAV_LINKS.map(({ href, label }, i) => (
            <span key={href} className="inline-flex items-center">
              {i > 0 ? (
                <span
                  className="mx-1.5 select-none text-[var(--muted)]/50"
                  aria-hidden
                >
                  ·
                </span>
              ) : null}
              <Link href={href} className={linkClass}>
                {label}
              </Link>
            </span>
          ))}
        </nav>

        <div className="flex items-center justify-between gap-3 text-xs text-[var(--muted)] sm:justify-end sm:gap-0">
          <div className="flex min-w-0 items-baseline gap-2 sm:hidden">
            <Link
              href="/"
              className="shrink-0 font-[family-name:var(--font-display)] text-sm font-bold tracking-tight text-[var(--brand)] transition hover:text-[var(--brand-dark)]"
            >
              Cohortly
            </Link>
            <span>© {year} Cohortly</span>
          </div>
          <a href="mailto:cohortly.in@gmail.com" className={linkClass}>
            cohortly.in@gmail.com
          </a>
        </div>
      </div>
    </footer>
  );
}
