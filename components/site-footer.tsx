"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Fragment } from "react";

const FEATURE_LINKS = [
  { href: "/features/network", label: "Network" },
  { href: "/features/mentors", label: "Mentors" },
  { href: "/features/referrals", label: "Referrals" },
  { href: "/features/opportunities", label: "Opportunities" },
] as const;

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
      <div className="mx-auto w-full max-w-6xl px-4 py-7 sm:px-6 sm:py-8">
        <div className="grid gap-7 sm:grid-cols-2 lg:grid-cols-4 lg:gap-8">
          {/* Brand */}
          <div className="min-w-0 sm:col-span-2 lg:col-span-1">
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

          {/* Features — compact inline group */}
          <div>
            <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-700">
              Features
            </h2>
            <nav
              aria-label="Features"
              className="mt-3 flex flex-wrap items-center gap-x-1.5 gap-y-1 text-sm"
            >
              {FEATURE_LINKS.map(({ href, label }, index) => (
                <Fragment key={href}>
                  {index > 0 ? (
                    <span className="text-slate-400" aria-hidden>
                      ·
                    </span>
                  ) : null}
                  <Link href={href} className={linkClass}>
                    {label}
                  </Link>
                </Fragment>
              ))}
            </nav>
          </div>

          {/* Company */}
          <div>
            <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-700">
              Company
            </h2>
            <nav
              aria-label="Company"
              className="mt-3 flex flex-wrap items-center gap-x-1.5 gap-y-1 text-sm sm:flex-col sm:items-start sm:gap-1.5"
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

        <div className="mt-7 border-t border-teal-900/8 pt-4">
          <p className="text-xs text-[var(--muted)] sm:text-sm">
            © {year} Cohortly. All rights reserved.
          </p>
        </div>
      </div>
    </footer>
  );
}
