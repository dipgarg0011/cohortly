import Link from "next/link";
import { redirect } from "next/navigation";
import { BrandLogo } from "@/components/brand-logo";
import { AskLedger } from "@/components/landing/ask-ledger";
import { HeroTypewriter } from "@/components/landing/hero-typewriter";
import { SmoothScrollLink } from "@/components/landing/smooth-scroll-link";
import { createClient } from "@/lib/supabase/server";

const STEPS = [
  {
    n: "01",
    title: "Ask",
    body: "Post what you need, plainly.",
  },
  {
    n: "02",
    title: "Match",
    body: "Cohortly routes it to the right seniors and alumni.",
  },
  {
    n: "03",
    title: "Answer",
    body: "Get a real reply, not a maybe.",
  },
] as const;

const PILLARS = [
  {
    title: "Mentors",
    body: "Ask, and get routed to someone who actually knows.",
    href: "/mentors",
  },
  {
    title: "Referrals",
    body: "A warm intro, not a cold application.",
    href: "/referrals",
  },
  {
    title: "Opportunities",
    body: "Shared by people who'd actually vouch for it.",
    href: "/opportunities",
  },
] as const;

const focusRing =
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand)] focus-visible:ring-offset-2";

export default async function Home() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (user) {
    redirect("/dashboard");
  }

  return (
    <div className="relative flex min-h-full min-w-0 flex-1 flex-col overflow-x-hidden">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top,_#d8f3ee_0%,_transparent_55%),radial-gradient(ellipse_at_bottom_right,_#e8eefc_0%,_transparent_45%)]"
      />

      {/* 1. HERO */}
      <section className="relative z-10 mx-auto flex w-full min-w-0 max-w-3xl flex-col items-center px-4 pb-16 pt-14 text-center sm:px-6 sm:pb-20 sm:pt-20">
        <h1 className="sr-only">Cohortly</h1>
        <div className="flex justify-center">
          <BrandLogo href={null} variant="wordmark" size="hero" priority />
        </div>
        <p className="mt-4 max-w-md text-base text-[var(--muted)] sm:text-lg">
          Your college network for mentorship, referrals, and advice.
        </p>

        <HeroTypewriter />

        <div className="mt-9 flex w-full min-w-0 max-w-md flex-col items-stretch gap-3 sm:max-w-none sm:flex-row sm:items-center sm:justify-center">
          <Link
            href="/auth"
            className={`btn-primary w-full sm:w-auto ${focusRing}`}
          >
            Get started
          </Link>
          <SmoothScrollLink
            href="#how-it-works"
            className={`inline-flex w-full items-center justify-center rounded-xl border border-transparent px-5 py-2.5 text-sm font-semibold text-[var(--brand)] transition hover:bg-teal-50/80 sm:w-auto ${focusRing}`}
          >
            See how it works
          </SmoothScrollLink>
        </div>
      </section>

      {/* 2. THE PROBLEM */}
      <section className="relative z-10 border-t border-teal-900/8">
        <div className="mx-auto w-full min-w-0 max-w-3xl px-4 py-20 sm:px-6 sm:py-28">
          <blockquote className="min-w-0">
            <p className="font-[family-name:var(--font-display)] text-[1.65rem] font-bold leading-[1.2] tracking-tight text-slate-900 sm:text-3xl sm:leading-[1.18] md:text-[2.15rem]">
              The person who could help you is already in your network. You just
              can&apos;t find them.
            </p>
            <p className="mt-8 max-w-2xl text-base leading-[1.75] text-[var(--muted)] sm:text-[1.05rem] sm:leading-[1.8]">
              Most of the useful help in college happens through someone you
              almost know — a senior two batches ahead, a grad at a company you
              care about, a classmate who just went through the same interview.
              Those connections are hard to find when everyone is scattered
              across WhatsApp groups and LinkedIn.
            </p>
          </blockquote>
        </div>
      </section>

      {/* 3. HOW IT WORKS */}
      <section
        id="how-it-works"
        className="relative z-10 scroll-mt-20 border-t border-teal-900/8"
      >
        <div className="mx-auto w-full min-w-0 max-w-5xl px-4 py-16 sm:px-6 sm:py-20">
          <h2 className="section-title text-center">How it works</h2>
          <ol className="mt-12 grid min-w-0 grid-cols-1 gap-10 md:grid-cols-3 md:gap-8">
            {STEPS.map((step) => (
              <li key={step.n} className="min-w-0 text-center md:text-left">
                <p className="font-[family-name:var(--font-display)] text-sm font-bold tabular-nums tracking-wide text-[var(--brand)]">
                  {step.n}
                </p>
                <h3 className="mt-2 font-[family-name:var(--font-display)] text-xl font-bold tracking-tight text-slate-900">
                  {step.title}
                </h3>
                <p className="mt-2 text-[0.95rem] leading-relaxed text-[var(--muted)] sm:text-base">
                  {step.body}
                </p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* 4. THE LEDGER */}
      <section className="relative z-10 border-t border-teal-900/8">
        <div className="mx-auto w-full min-w-0 max-w-3xl px-4 py-16 sm:px-6 sm:py-20">
          <h2 className="section-title text-center sm:text-left">
            What people are asking, right now.
          </h2>
          <AskLedger />
        </div>
      </section>

      {/* 5. THREE PILLARS */}
      <section className="relative z-10 border-t border-teal-900/8">
        <div className="mx-auto w-full min-w-0 max-w-3xl px-4 py-16 sm:px-6 sm:py-20">
          <ul className="divide-y divide-teal-900/10">
            {PILLARS.map((pillar) => (
              <li key={pillar.href} className="min-w-0 py-6 first:pt-0 last:pb-0">
                <Link
                  href={pillar.href}
                  className={`group flex min-w-0 flex-col gap-1 rounded-lg sm:flex-row sm:items-baseline sm:gap-4 ${focusRing}`}
                >
                  <span className="shrink-0 font-[family-name:var(--font-display)] text-lg font-bold tracking-tight text-slate-900 transition group-hover:text-[var(--brand)]">
                    {pillar.title}
                  </span>
                  <span className="min-w-0 text-[0.95rem] leading-relaxed text-[var(--muted)] sm:text-base">
                    {pillar.body}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* 6. BUILT BY STUDENTS + FINAL CTA */}
      <section className="relative z-10 border-t border-teal-900/8">
        <div className="mx-auto w-full min-w-0 max-w-3xl px-4 py-16 sm:px-6 sm:py-20">
          <p className="max-w-2xl text-base leading-[1.75] text-slate-700 sm:text-[1.05rem] sm:leading-[1.8]">
            Cohortly is built by students, for students. We&apos;re shipping the
            tools we wished we had when we needed a mentor, a referral, or an
            honest read on an opportunity.
          </p>

          <div className="mt-12 rounded-xl border border-teal-900/10 bg-white/80 px-5 py-7 sm:px-8 sm:py-8">
            <p className="font-[family-name:var(--font-display)] text-xl font-bold tracking-tight text-slate-900 sm:text-2xl">
              Join your college on Cohortly
            </p>
            <div className="mt-6 flex w-full min-w-0 flex-col gap-3 sm:flex-row sm:items-center">
              <Link
                href="/auth"
                className={`btn-primary w-full sm:w-auto ${focusRing}`}
              >
                Get started
              </Link>
              <a
                href="mailto:cohortly.in@gmail.com?subject=Bring%20Cohortly%20to%20my%20college"
                className={`inline-flex w-full items-center justify-center rounded-xl border border-teal-900/15 bg-white px-5 py-2.5 text-sm font-semibold text-[var(--brand)] transition hover:bg-teal-50 sm:w-auto ${focusRing}`}
              >
                Bring Cohortly to your college
              </a>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
