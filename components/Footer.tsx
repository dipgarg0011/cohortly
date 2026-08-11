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

/** Soft mint panel — sits above page `#eef3f2` for a contained premium feel */
const PANEL_BG = "#e2ebe8";

const linkClass =
  "inline-flex items-center rounded-sm py-0 text-[0.8125rem] leading-[1.45] text-slate-600 transition-colors duration-150 hover:text-[var(--brand-dark)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand)] focus-visible:ring-offset-2 focus-visible:ring-offset-[#e2ebe8]";

const sectionLabelClass =
  "text-[0.6875rem] font-bold uppercase tracking-[0.14em] text-slate-700";

function scrollToTop() {
  window.scrollTo({ top: 0, behavior: "smooth" });
}

/** Faint geometric peak / ridge lines — Ataraxis-style structure, Cohortly teal */
function FooterPattern() {
  return (
    <svg
      aria-hidden
      className="pointer-events-none absolute inset-0 h-full w-full opacity-[0.14]"
      xmlns="http://www.w3.org/2000/svg"
      preserveAspectRatio="xMidYMid slice"
    >
      <defs>
        <pattern
          id="footer-ridge-pattern"
          width="120"
          height="56"
          patternUnits="userSpaceOnUse"
        >
          <path
            d="M0 40 L20 22 L40 40 L60 18 L80 40 L100 24 L120 40"
            fill="none"
            stroke="#0f766e"
            strokeWidth="1"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <path
            d="M0 48 L24 34 L48 48 L72 30 L96 48 L120 36"
            fill="none"
            stroke="#0d5f59"
            strokeWidth="0.75"
            strokeLinecap="round"
            strokeLinejoin="round"
            opacity="0.7"
          />
          <path
            d="M0 28 L30 12 L60 28 L90 10 L120 28"
            fill="none"
            stroke="#0f766e"
            strokeWidth="0.6"
            strokeLinecap="round"
            strokeLinejoin="round"
            opacity="0.55"
          />
        </pattern>
        <linearGradient id="footer-pattern-fade" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="white" stopOpacity="0.35" />
          <stop offset="45%" stopColor="white" stopOpacity="1" />
          <stop offset="100%" stopColor="white" stopOpacity="0.85" />
        </linearGradient>
        <mask id="footer-pattern-mask">
          <rect width="100%" height="100%" fill="url(#footer-pattern-fade)" />
        </mask>
      </defs>
      <rect
        width="100%"
        height="100%"
        fill="url(#footer-ridge-pattern)"
        mask="url(#footer-pattern-mask)"
      />
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
    <footer className="relative mt-auto w-full shrink-0 px-3 pb-3 pt-4 sm:px-5 sm:pb-4 sm:pt-5">
      <div
        className="relative mx-auto w-full max-w-6xl overflow-hidden rounded-2xl border border-teal-900/10 shadow-[0_1px_2px_rgba(15,23,42,0.04),0_10px_28px_-18px_rgba(15,118,110,0.18)]"
        style={{
          background: `linear-gradient(165deg, #eaf1ef 0%, ${PANEL_BG} 48%, #dce7e4 100%)`,
        }}
      >
        <FooterPattern />

        <div className="relative px-4 pt-4 sm:px-6 sm:pt-5">
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

              <div className="col-span-2 min-w-0 border-t border-teal-900/8 pt-3 sm:col-span-1 sm:border-t-0 sm:pt-0">
                <h2 className={sectionLabelClass}>Get in touch</h2>
                <div className="mt-3.5 flex flex-col items-start gap-2">
                  <a
                    href="mailto:cohortly.in@gmail.com"
                    className={`${linkClass} break-safe font-medium text-slate-600 hover:text-[var(--brand-dark)]`}
                  >
                    cohortly.in@gmail.com
                  </a>
                  <a
                    href="https://www.linkedin.com/company/143100184/"
                    target="_blank"
                    rel="noopener noreferrer"
                    className={linkClass}
                  >
                    LinkedIn
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

          <div className="mt-7 flex flex-col items-start gap-2 border-t border-teal-900/10 py-3 sm:mt-8 sm:flex-row sm:items-center sm:justify-between sm:gap-3 sm:py-3.5">
            <p className="text-xs text-slate-500">
              © {year} Cohortly. All rights reserved.
            </p>
            <button
              type="button"
              onClick={scrollToTop}
              className="shrink-0 rounded-sm py-0 text-xs font-semibold leading-[1.45] text-[var(--brand)] transition-colors duration-150 hover:text-[var(--brand-dark)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand)] focus-visible:ring-offset-2 focus-visible:ring-offset-[#e2ebe8]"
            >
              Back to top
            </button>
          </div>
        </div>

        {/* Thin brand accent — panel finish, not gold */}
        <div
          aria-hidden
          className="relative h-[3px] w-full bg-gradient-to-r from-[var(--brand-dark)] via-[var(--brand)] to-[var(--brand-soft)]"
        />
      </div>
    </footer>
  );
}

/** @deprecated Prefer `Footer` — kept for existing imports */
export { Footer as SiteFooter };
