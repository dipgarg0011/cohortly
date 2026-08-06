"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { BrandLogo } from "@/components/brand-logo";

const FEATURE_LINKS = [
  { href: "/network", label: "Network" },
  { href: "/mentors", label: "Mentors" },
  { href: "/referrals", label: "Referrals" },
  { href: "/opportunities", label: "Opportunities" },
] as const;

const COMPANY_LINKS = [
  { href: "/about", label: "About" },
  { href: "/privacy", label: "Privacy" },
  { href: "/terms", label: "Terms" },
  { href: "/guidelines", label: "Guidelines" },
] as const;

const linkClass =
  "text-sm text-[var(--muted)] transition hover:text-[var(--brand)] hover:underline";

function scrollToTop() {
  window.scrollTo({ top: 0, behavior: "smooth" });
}

export function Footer() {
  const pathname = usePathname();

  const hideFooter =
    pathname === "/messages" ||
    pathname.startsWith("/messages/") ||
    pathname === "/auth" ||
    pathname.startsWith("/auth/") ||
    pathname === "/complete-profile" ||
    pathname.startsWith("/complete-profile/");

  if (hideFooter) return null;

  const year = new Date().getFullYear();

  return (
    <footer className="mt-auto border-t border-teal-900/8 bg-[#e4ebe9]">
      <div className="mx-auto w-full max-w-6xl px-4 py-8 sm:px-6 sm:py-10">
        <div className="grid gap-8 sm:grid-cols-2 lg:grid-cols-4 lg:gap-10">
          <div className="min-w-0 sm:col-span-2 lg:col-span-1">
            <BrandLogo href="/" variant="wordmark" size="lg" />
            <p className="mt-3 max-w-xs text-sm leading-relaxed text-[var(--muted)]">
              A private network for students and graduates at your college.
            </p>
            <p className="mt-3 text-sm text-[var(--muted)]">
              Made by students, for students.
            </p>
          </div>

          <div>
            <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-500">
              Features
            </h2>
            <nav
              aria-label="Features"
              className="mt-3 flex flex-col items-start gap-2"
            >
              {FEATURE_LINKS.map(({ href, label }) => (
                <Link key={href} href={href} className={linkClass}>
                  {label}
                </Link>
              ))}
            </nav>
          </div>

          <div>
            <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-500">
              Company
            </h2>
            <nav
              aria-label="Company"
              className="mt-3 flex flex-col items-start gap-2"
            >
              {COMPANY_LINKS.map(({ href, label }) => (
                <Link key={href} href={href} className={linkClass}>
                  {label}
                </Link>
              ))}
            </nav>
          </div>

          <div>
            <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-500">
              Get in touch
            </h2>
            <div className="mt-3">
              <a href="mailto:cohortly.in@gmail.com" className={linkClass}>
                cohortly.in@gmail.com
              </a>
            </div>
          </div>
        </div>

        <div className="mt-8 flex flex-col gap-3 border-t border-teal-900/8 pt-5 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-xs text-[var(--muted)] sm:text-sm">
            © {year} Cohortly. All rights reserved.
          </p>
          <button
            type="button"
            onClick={scrollToTop}
            className="self-start text-xs font-semibold text-[var(--brand)] transition hover:text-[var(--brand-dark)] hover:underline sm:self-auto sm:text-sm"
          >
            Back to top
          </button>
        </div>
      </div>
    </footer>
  );
}

/** @deprecated Prefer `Footer` — kept for existing imports */
export { Footer as SiteFooter };
