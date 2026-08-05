"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";

const PRODUCT_LINKS = [
  { href: "/network", label: "Network" },
  { href: "/mentors", label: "Mentors" },
  { href: "/referrals", label: "Referrals" },
  { href: "/opportunities", label: "Opportunities" },
] as const;

const COMPANY_LINKS = [
  { href: "/about", label: "About" },
  { href: "/contact", label: "Contact" },
  { href: "/privacy", label: "Privacy Policy" },
  { href: "/terms", label: "Terms of Use" },
  { href: "/guidelines", label: "Community Guidelines" },
] as const;

const linkClass =
  "text-[var(--muted)] transition hover:text-[var(--brand)]";

export function SiteFooter() {
  const pathname = usePathname();
  const supabase = useMemo(() => createClient(), []);
  const [loggedIn, setLoggedIn] = useState(false);

  const hideFooter =
    pathname === "/messages" || pathname.startsWith("/messages/");

  useEffect(() => {
    if (hideFooter) return;
    let cancelled = false;

    void supabase.auth.getUser().then(({ data: { user } }) => {
      if (!cancelled) setLoggedIn(Boolean(user));
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!cancelled) setLoggedIn(Boolean(session?.user));
    });

    return () => {
      cancelled = true;
      subscription.unsubscribe();
    };
  }, [supabase, hideFooter, pathname]);

  if (hideFooter) return null;

  const year = new Date().getFullYear();

  return (
    <footer className="mt-auto border-t border-teal-900/8 bg-[#e4ebe9]">
      <div className="mx-auto w-full max-w-6xl px-4 py-10 sm:px-6 sm:py-12">
        <div
          className={`grid gap-8 sm:gap-10 ${
            loggedIn
              ? "md:grid-cols-2 lg:grid-cols-4"
              : "md:grid-cols-3"
          }`}
        >
          <div className="min-w-0 max-w-xs">
            <Link
              href={loggedIn ? "/dashboard" : "/"}
              className="inline-block rounded-lg px-1 py-0.5 font-[family-name:var(--font-display)] text-lg font-bold tracking-tight text-[var(--brand)] transition hover:bg-teal-50/80 hover:text-[var(--brand-dark)]"
            >
              Cohortly
            </Link>
            <p className="mt-2 text-sm leading-relaxed text-[var(--muted)]">
              A private network for IIT BHU students and graduates.
            </p>
          </div>

          {loggedIn ? (
            <div>
              <p className="text-xs font-bold uppercase tracking-wider text-slate-500">
                Product
              </p>
              <ul className="mt-3 space-y-2 text-sm">
                {PRODUCT_LINKS.map(({ href, label }) => (
                  <li key={href}>
                    <Link href={href} className={linkClass}>
                      {label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          <div>
            <p className="text-xs font-bold uppercase tracking-wider text-slate-500">
              Company
            </p>
            <ul className="mt-3 space-y-2 text-sm">
              {COMPANY_LINKS.map(({ href, label }) => (
                <li key={href}>
                  <Link href={href} className={linkClass}>
                    {label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          <div>
            <p className="text-xs font-bold uppercase tracking-wider text-slate-500">
              Get in touch
            </p>
            <ul className="mt-3 space-y-2 text-sm">
              <li>
                <a
                  href="mailto:cohortly.in@gmail.com"
                  className={linkClass}
                >
                  cohortly.in@gmail.com
                </a>
              </li>
            </ul>
          </div>
        </div>

        <div className="mt-10 flex flex-col gap-2 border-t border-teal-900/10 pt-5 text-xs text-slate-500 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
          <p>© {year} Cohortly. All rights reserved.</p>
          <p className="sm:text-right">Made by students, for students</p>
        </div>
      </div>
    </footer>
  );
}
