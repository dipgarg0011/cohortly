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

const linkClass =
  "inline-flex items-center rounded-sm py-0 text-[0.8125rem] leading-[1.45] text-slate-600 underline-offset-2 transition-[color,opacity,text-decoration-color] duration-150 hover:text-[var(--brand)] hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--background)]";

const iconBtnClass =
  "inline-flex h-10 w-10 items-center justify-center rounded-md text-slate-600 transition-[color,background-color,opacity] duration-150 hover:bg-[var(--brand-soft)]/60 hover:text-[var(--brand)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--background)]";

const sectionLabelClass =
  "text-[0.6875rem] font-bold uppercase tracking-[0.14em] text-slate-700";

function scrollToTop() {
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function MailIcon({ className }: { className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.9"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden
    >
      <rect x="3" y="5" width="18" height="14" rx="2" />
      <path d="m3 7 9 7 9-7" />
    </svg>
  );
}

function LinkedInIcon({ className }: { className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="currentColor"
      className={className}
      aria-hidden
    >
      <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 01-2.063-2.065 2.064 2.064 0 112.063 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z" />
    </svg>
  );
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
    <footer className="relative mt-auto w-full shrink-0 border-t border-[var(--border)] bg-[var(--background)]">
      <div className="relative mx-auto w-full max-w-6xl px-4 pt-4 sm:px-6 sm:pt-5">
        <div className="grid items-start gap-5 sm:gap-6 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1.9fr)] lg:gap-10">
          <div className="min-w-0">
            <BrandLogo href="/" variant="wordmark" size="lg" />
            <div className="mt-2 max-w-[17.5rem]">
              <p className="text-sm leading-snug text-slate-600">
                A private network for students and graduates at your college.
              </p>
              <p className="mt-1 text-xs font-semibold tracking-wide text-[var(--brand)]">
                Made by students, for students.
              </p>
            </div>
          </div>

          <div className="grid grid-cols-2 items-start gap-x-6 gap-y-4 sm:grid-cols-3 sm:gap-x-8 sm:gap-y-0">
            <div className="min-w-0">
              <h2 className={sectionLabelClass}>Features</h2>
              <nav
                aria-label="Features"
                className="mt-3.5 flex flex-col items-start gap-2"
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
                className="mt-3.5 flex flex-col items-start gap-2"
              >
                {COMPANY_LINKS.map(({ href, label }) => (
                  <Link key={href} href={href} className={linkClass}>
                    {label}
                  </Link>
                ))}
              </nav>
            </div>

            <div className="col-span-2 min-w-0 border-t border-[var(--border)] pt-3 sm:col-span-1 sm:border-t-0 sm:pt-0">
              <h2 className={sectionLabelClass}>Get in touch</h2>
              <div className="mt-3.5 flex flex-col items-start gap-2.5">
                <div className="flex items-center gap-1">
                  <a
                    href="mailto:cohortly.in@gmail.com"
                    aria-label="Email Cohortly at cohortly.in@gmail.com"
                    title="cohortly.in@gmail.com"
                    className={iconBtnClass}
                  >
                    <MailIcon className="h-5 w-5" />
                  </a>
                  <a
                    href="https://www.linkedin.com/company/143100184/"
                    target="_blank"
                    rel="noopener noreferrer"
                    aria-label="Cohortly on LinkedIn"
                    title="LinkedIn"
                    className={iconBtnClass}
                  >
                    <LinkedInIcon className="h-4 w-4" />
                  </a>
                </div>
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

        <div className="mt-7 flex flex-col items-start gap-2 border-t border-[var(--border)] py-3 sm:mt-8 sm:flex-row sm:items-center sm:justify-between sm:gap-3 sm:py-3.5">
          <p className="text-xs text-slate-500">
            © {year} Cohortly. All rights reserved.
          </p>
          <button
            type="button"
            onClick={scrollToTop}
            className="shrink-0 rounded-sm py-0 text-xs font-semibold leading-[1.45] text-[var(--brand)] underline-offset-2 transition-[color,opacity] duration-150 hover:text-[var(--brand-dark)] hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--background)]"
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
