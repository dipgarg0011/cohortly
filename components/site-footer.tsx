"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const COMPANY_LINKS = [
  { href: "/about", label: "About" },
  { href: "/privacy", label: "Privacy" },
  { href: "/terms", label: "Terms" },
  { href: "/guidelines", label: "Guidelines" },
  { href: "/contact", label: "Contact" },
] as const;

const linkClass =
  "text-sm text-[var(--muted)] transition hover:text-[var(--brand)]";

export function SiteFooter() {
  const pathname = usePathname();

  const hideFooter =
    pathname === "/messages" || pathname.startsWith("/messages/");

  if (hideFooter) return null;

  const year = new Date().getFullYear();

  return (
    <footer className="mt-auto border-t border-teal-900/8 bg-[#e4ebe9]">
      <div className="mx-auto w-full max-w-6xl px-4 py-8 sm:px-6 sm:py-9">
        <div className="grid gap-8 sm:grid-cols-3 sm:gap-10">
          {/* Brand */}
          <div className="min-w-0">
            <Link
              href="/"
              className="font-[family-name:var(--font-display)] text-lg font-bold tracking-tight text-[var(--brand)] transition hover:text-[var(--brand-dark)]"
            >
              Cohortly
            </Link>
            <p className="mt-2 max-w-xs text-sm leading-relaxed text-[var(--muted)]">
              A private network for students and graduates at your college.
            </p>
          </div>

          {/* Company */}
          <div>
            <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-700">
              Company
            </h2>
            <nav
              aria-label="Footer"
              className="mt-3 flex flex-col gap-2 sm:gap-1.5"
            >
              {COMPANY_LINKS.map(({ href, label }) => (
                <Link key={href} href={href} className={linkClass}>
                  {label}
                </Link>
              ))}
            </nav>
          </div>

          {/* Get in touch */}
          <div>
            <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-700">
              Get in touch
            </h2>
            <div className="mt-3 flex flex-col gap-2">
              <a href="mailto:cohortly.in@gmail.com" className={linkClass}>
                cohortly.in@gmail.com
              </a>
              <p className="text-sm text-[var(--muted)]">
                Made by students, for students
              </p>
            </div>
          </div>
        </div>

        <div className="mt-8 border-t border-teal-900/8 pt-5">
          <p className="text-xs text-[var(--muted)] sm:text-sm">
            © {year} Cohortly. All rights reserved.
          </p>
        </div>
      </div>
    </footer>
  );
}
