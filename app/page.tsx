import Link from "next/link";
import { redirect } from "next/navigation";
import { BrandLogo } from "@/components/brand-logo";
import { createClient } from "@/lib/supabase/server";

const FEATURES = [
  {
    href: "/network",
    title: "Network",
    blurb: "Find batchmates and alumni from your campus.",
  },
  {
    href: "/mentors",
    title: "Mentors",
    blurb: "Ask seniors who've already done the hard parts.",
  },
  {
    href: "/referrals",
    title: "Referrals",
    blurb: "Request intros when you're ready to apply.",
  },
  {
    href: "/opportunities",
    title: "Opportunities",
    blurb: "See roles shared by people you trust.",
  },
] as const;

const STEPS = [
  {
    title: "Find",
    blurb: "Search people from your college by batch, role, or company.",
  },
  {
    title: "Connect",
    blurb: "Reach out for advice, mentorship, or a warm intro.",
  },
  {
    title: "Help",
    blurb: "Share what you know so the next person moves faster.",
  },
] as const;

const focusRing =
  "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--brand)]";

const sectionRule = "border-t border-teal-900/10";

export default async function Home() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (user) {
    redirect("/dashboard");
  }

  return (
    <div className="relative flex min-h-full flex-1 flex-col overflow-x-clip">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top,_#d8f3ee_0%,_transparent_55%),radial-gradient(ellipse_at_bottom_right,_#e8eefc_0%,_transparent_45%)]"
      />

      <main className="relative z-10 mx-auto flex w-full min-w-0 max-w-2xl flex-1 flex-col px-4 py-12 sm:max-w-3xl sm:px-6 sm:py-16 lg:py-20">
        {/* 1. Hero */}
        <section className="flex min-w-0 flex-col items-center text-center animate-fade-up">
          <BrandLogo href={null} variant="wordmark" size="lg" priority />
          <h1 className="mt-8 max-w-xl font-[family-name:var(--font-display)] text-[clamp(1.85rem,5.5vw,2.75rem)] font-bold leading-[1.12] tracking-[-0.02em] text-slate-900">
            Your college. Your people. Your network.
          </h1>
          <p className="mt-4 max-w-md text-base leading-relaxed text-[var(--muted)] sm:text-lg">
            Find people. Reconnect with your network. Get referrals. Find mentors. Discover opportunities — all within your college.
          </p>
          <div className="mt-8 flex w-full min-w-0 max-w-xs justify-center sm:max-w-none">
            <Link
              href="/auth"
              className={`btn-primary w-full sm:w-auto ${focusRing}`}
            >
              Join your college network →
            </Link>
          </div>
        </section>

        {/* 2. Problem */}
        <section
          aria-labelledby="problem-heading"
          className={`mt-20 min-w-0 pt-14 sm:mt-24 sm:pt-16 animate-fade-up ${sectionRule}`}
        >
          <h2
            id="problem-heading"
            className="max-w-lg font-[family-name:var(--font-display)] text-[clamp(1.45rem,4vw,2rem)] font-bold leading-tight tracking-[-0.015em] text-slate-900"
          >
            Your network already exists.
            <span className="mt-2 block text-slate-500">
              It&apos;s just scattered everywhere.
            </span>
          </h2>
          <p className="mt-8 max-w-sm text-base leading-relaxed text-[var(--muted)] sm:text-lg">
            WhatsApp. LinkedIn. Random DMs. Alumni groups.
          </p>
          <p className="mt-6 max-w-md font-[family-name:var(--font-display)] text-lg font-semibold text-slate-800 sm:text-xl">
            Cohortly brings it together.
          </p>
        </section>

        {/* 3. Features */}
        <section
          aria-labelledby="features-heading"
          className={`mt-20 min-w-0 pt-14 sm:mt-24 sm:pt-16 animate-fade-up ${sectionRule}`}
        >
          <h2
            id="features-heading"
            className="max-w-lg font-[family-name:var(--font-display)] text-[clamp(1.35rem,3.5vw,1.75rem)] font-bold leading-tight tracking-[-0.015em] text-slate-900"
          >
            Everything your college network should make easier.
          </h2>
          <ul className="mt-10 divide-y divide-teal-900/10">
            {FEATURES.map((feature) => (
              <li key={feature.href} className="min-w-0">
                <Link
                  href={feature.href}
                  className={`group flex min-w-0 items-baseline justify-between gap-4 py-4 transition-colors sm:py-5 ${focusRing} rounded-sm`}
                >
                  <span className="min-w-0">
                    <span className="block font-[family-name:var(--font-display)] text-base font-bold text-slate-800 transition-colors group-hover:text-[var(--brand)] sm:text-lg">
                      {feature.title}
                    </span>
                    <span className="mt-1 block text-sm leading-snug text-[var(--muted)] sm:text-[0.9375rem]">
                      {feature.blurb}
                    </span>
                  </span>
                  <span
                    aria-hidden
                    className="shrink-0 text-[var(--muted)] transition-colors group-hover:text-[var(--brand)]"
                  >
                    →
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>

        {/* 4. How it works */}
        <section
          aria-labelledby="how-it-works-heading"
          className={`mt-20 min-w-0 pt-14 sm:mt-24 sm:pt-16 animate-fade-up ${sectionRule}`}
        >
          <h2
            id="how-it-works-heading"
            className="font-[family-name:var(--font-display)] text-[clamp(1.35rem,3.5vw,1.75rem)] font-bold tracking-[-0.015em] text-slate-900"
          >
            Find → Connect → Help
          </h2>
          <ol className="mt-10 grid min-w-0 grid-cols-1 gap-8 sm:grid-cols-3 sm:gap-6">
            {STEPS.map((step, i) => (
              <li key={step.title} className="min-w-0">
                <p className="text-xs font-semibold uppercase tracking-wider text-[var(--brand)]">
                  {i + 1}. {step.title}
                </p>
                <p className="mt-2 text-sm leading-relaxed text-[var(--muted)] sm:text-[0.9375rem]">
                  {step.blurb}
                </p>
              </li>
            ))}
          </ol>
        </section>

        {/* 5. Differentiator */}
        <section
          aria-labelledby="differentiator-heading"
          className={`mt-20 min-w-0 pt-14 sm:mt-24 sm:pt-16 animate-fade-up ${sectionRule}`}
        >
          <h2
            id="differentiator-heading"
            className="max-w-md font-[family-name:var(--font-display)] text-[clamp(1.45rem,4vw,2rem)] font-bold leading-tight tracking-[-0.015em] text-slate-900"
          >
            Not another LinkedIn.
            <span className="mt-2 block">Just your college.</span>
          </h2>
          <p className="mt-6 max-w-md text-base leading-relaxed text-[var(--muted)] sm:text-lg">
            A college-verified community — people you actually share a campus
            with, so every ask is relevant and every intro starts with trust.
          </p>
        </section>

        {/* 6. Final CTA */}
        <section
          aria-labelledby="final-cta-heading"
          className={`mt-20 mb-4 min-w-0 pt-14 text-center sm:mt-24 sm:mb-8 sm:pt-16 animate-fade-up ${sectionRule}`}
        >
          <h2
            id="final-cta-heading"
            className="mx-auto max-w-md font-[family-name:var(--font-display)] text-[clamp(1.45rem,4vw,2rem)] font-bold leading-tight tracking-[-0.015em] text-slate-900"
          >
            Your college already has a network.
            <span className="mt-2 block">Make it useful.</span>
          </h2>
          <div className="mt-8 flex w-full min-w-0 justify-center">
            <Link
              href="/auth"
              className={`btn-primary w-full max-w-xs sm:w-auto sm:max-w-none ${focusRing}`}
            >
              Join Cohortly →
            </Link>
          </div>
          <p className="mt-5 text-sm text-[var(--muted)]">
            Starting with one campus. Building for every campus.
          </p>
        </section>
      </main>
    </div>
  );
}
