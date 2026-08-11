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
  { href: "/contact", label: "Contact" },
  { href: "/privacy", label: "Privacy" },
  { href: "/terms", label: "Terms" },
  { href: "/guidelines", label: "Guidelines" },
] as const;

const FOOTER_BG = "#e4ebe9";

const linkClass =
  "inline-flex min-h-8 items-center rounded-sm text-[0.8125rem] leading-none text-[var(--muted)] transition-colors duration-150 hover:text-[var(--brand-dark)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand)] focus-visible:ring-offset-2 focus-visible:ring-offset-[#e4ebe9]";

const sectionLabelClass =
  "text-[0.6875rem] font-bold uppercase tracking-[0.14em] text-slate-700";

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
    <footer
      className="relative mt-auto w-full border-t border-teal-900/10"
      style={{
        background: `linear-gradient(180deg, #e9f0ee 0%, ${FOOTER_BG} 42%)`,
      }}
    >
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-teal-700/20 to-transparent"
      />

      <div className="mx-auto w-full max-w-6xl px-4 pb-5 pt-7 sm:px-6 sm:pb-6 sm:pt-9">
        <div className="grid gap-7 sm:gap-8 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1.9fr)] lg:items-start lg:gap-14">
          <div className="min-w-0 space-y-3">
            <BrandLogo href="/" variant="wordmark" size="lg" />
            <div className="max-w-[17.5rem] space-y-1.5">
              <p className="text-sm leading-snug text-slate-600">
                A private network for students and graduates at your college.
              </p>
              <p className="text-xs font-semibold tracking-wide text-[var(--brand)]">
                Made by students, for students.
              </p>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-x-6 gap-y-6 sm:grid-cols-3 sm:gap-x-8 sm:gap-y-0">
            <div className="min-w-0">
              <h2 className={sectionLabelClass}>Features</h2>
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

            <div className="min-w-0">
              <h2 className={sectionLabelClass}>Company</h2>
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

            <div className="col-span-2 min-w-0 border-t border-teal-900/8 pt-5 sm:col-span-1 sm:border-t-0 sm:pt-0">
              <h2 className={sectionLabelClass}>Get in touch</h2>
              <div className="mt-3 flex flex-col items-start gap-2">
                <a
                  href="mailto:cohortly.in@gmail.com"
                  className={`${linkClass} break-safe font-medium text-slate-600 hover:text-[var(--brand-dark)]`}
                >
                  cohortly.in@gmail.com
                </a>
                <a
                  href="mailto:cohortly.in@gmail.com?subject=Feedback%20for%20Cohortly"
                  className={linkClass}
                >
                  Suggest an improvement
                </a>
              </div>
            </div>
          </div>
        </div>

        <div className="mt-7 flex items-center justify-between gap-4 border-t border-teal-900/10 pt-4 sm:mt-8">
          <p className="text-xs text-slate-500">
            © {year} Cohortly. All rights reserved.
          </p>
          <button
            type="button"
            onClick={scrollToTop}
            className="min-h-8 shrink-0 rounded-sm text-xs font-semibold text-[var(--brand)] transition-colors duration-150 hover:text-[var(--brand-dark)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand)] focus-visible:ring-offset-2 focus-visible:ring-offset-[#e4ebe9]"
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
