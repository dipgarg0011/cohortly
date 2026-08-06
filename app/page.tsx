import Link from "next/link";
import { redirect } from "next/navigation";
import { BrandLogo } from "@/components/brand-logo";
import { createClient } from "@/lib/supabase/server";

const PILLARS = [
  {
    href: "/mentors",
    title: "Mentors",
    blurb: "Get guidance from seniors who have been there.",
  },
  {
    href: "/referrals",
    title: "Referrals",
    blurb: "Ask for intros when you are ready to apply.",
  },
  {
    href: "/opportunities",
    title: "Opportunities",
    blurb: "See roles and openings shared by your network.",
  },
] as const;

const STEPS = [
  { title: "Ask", blurb: "Share what you need â€” advice, a referral, or a role." },
  { title: "Match", blurb: "Find people from your college who can help." },
  { title: "Answer", blurb: "Connect, follow up, and move forward." },
] as const;

const focusRing =
  "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--brand)]";

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

      <main className="relative z-10 mx-auto w-full min-w-0 max-w-3xl px-4 py-12 sm:px-5 sm:py-16">
        {/* Hero */}
        <section className="flex flex-col items-center text-center">
          <h1 className="sr-only">Cohortly</h1>
          <div className="flex justify-center">
            <BrandLogo href={null} variant="wordmark" size="hero" priority />
          </div>
          <p className="mt-4 max-w-md text-base text-[var(--muted)] sm:text-lg">
            Your college network for mentorship, referrals, and advice.
          </p>
          <p className="mt-2 max-w-sm text-sm text-[var(--muted)]">
            A private space to ask for help and give it back within your college.
          </p>
          <div className="mt-8 flex w-full min-w-0 max-w-xs flex-col items-center gap-3 sm:max-w-none sm:flex-row sm:justify-center">
            <Link href="/auth" className={`btn-primary w-full sm:w-auto ${focusRing}`}>
              Get started
            </Link>
            <a
              href="#how-it-works"
              className={`rounded-sm text-sm font-semibold text-[var(--brand)] underline-offset-4 transition hover:underline ${focusRing}`}
            >
              Learn more
            </a>
          </div>
        </section>

        {/* Pillars */}
        <section
          aria-label="What you can do"
          className="mt-16 border-t border-teal-900/10 pt-12 sm:mt-20 sm:pt-14"
        >
          <ul className="grid min-w-0 grid-cols-1 gap-8 sm:grid-cols-3 sm:gap-0">
            {PILLARS.map((pillar, i) => (
              <li
                key={pillar.href}
                className={`min-w-0 text-center sm:px-5 ${
                  i > 0 ? "border-t border-teal-900/10 pt-8 sm:border-t-0 sm:border-l sm:pt-0" : ""
                }`}
              >
                <Link
                  href={pillar.href}
                  className={`group inline-flex flex-col items-center rounded-sm ${focusRing}`}
                >
                  <span className="font-[family-name:var(--font-display)] text-lg font-bold text-slate-800 transition group-hover:text-[var(--brand)]">
                    {pillar.title}
                  </span>
                  <span className="mt-1.5 max-w-[16rem] text-sm leading-relaxed text-[var(--muted)]">
                    {pillar.blurb}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>

        {/* How it works */}
        <section
          id="how-it-works"
          aria-labelledby="how-heading"
          className="mt-16 scroll-mt-8 border-t border-teal-900/10 pt-12 sm:mt-20 sm:pt-14"
        >
          <h2
            id="how-heading"
            className="text-center font-[family-name:var(--font-display)] text-xl font-bold text-slate-800 sm:text-2xl"
          >
            How it works
          </h2>
          <ol className="mt-8 grid min-w-0 grid-cols-1 gap-8 sm:grid-cols-3 sm:gap-6">
            {STEPS.map((step, i) => (
              <li key={step.title} className="min-w-0 text-center">
                <p className="text-xs font-semibold uppercase tracking-wide text-[var(--muted)]">
                  Step {i + 1}
                </p>
                <p className="mt-1 font-[family-name:var(--font-display)] text-lg font-bold text-slate-800">{step.title}</p>
                <p className="mt-1.5 text-sm leading-relaxed text-[var(--muted)]">{step.blurb}</p>
              </li>
            ))}
          </ol>
        </section>

        {/* Final CTA */}
        <section className="mt-16 border-t border-teal-900/10 pt-12 text-center sm:mt-20 sm:pt-14">
          <p className="text-base text-[var(--muted)] sm:text-lg">
            Ready to join your college network?
          </p>
          <p className="mt-1 text-sm text-[var(--muted)]">Built by students, for students.</p>
          <Link
            href="/auth"
            className={`btn-primary mt-6 inline-flex w-full max-w-xs sm:w-auto ${focusRing}`}
          >
            Get started
          </Link>
        </section>
      </main>
    </div>
  );
}