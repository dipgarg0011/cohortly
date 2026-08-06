import Link from "next/link";
import { redirect } from "next/navigation";
import { BrandLogo } from "@/components/brand-logo";
import { createClient } from "@/lib/supabase/server";

const PILLARS = [
  {
    href: "/mentors",
    title: "Mentors",
    blurb: "Guidance from seniors who've been there.",
  },
  {
    href: "/referrals",
    title: "Referrals",
    blurb: "Intros when you're ready to apply.",
  },
  {
    href: "/opportunities",
    title: "Opportunities",
    blurb: "Roles shared by your network.",
  },
] as const;

const STEPS = [
  {
    title: "Ask",
    blurb: "Post a question or what you need help with.",
  },
  {
    title: "Match",
    blurb: "Get matched with people from your college network.",
  },
  {
    title: "Answer",
    blurb: "Get advice, intros, or a clear next step.",
  },
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

      <main className="relative z-10 mx-auto flex w-full min-w-0 max-w-3xl flex-1 flex-col justify-center px-4 py-10 sm:px-5 sm:py-14">
        {/* Hero */}
        <section className="flex flex-col items-center text-center animate-fade-up">
          <h1 className="sr-only">Cohortly</h1>
          <div className="flex justify-center">
            <BrandLogo href={null} variant="wordmark" size="hero" priority />
          </div>
          <p className="mt-4 max-w-md text-base text-[var(--muted)] sm:text-lg">
            Your college network for mentorship, referrals, and advice.
          </p>
          <div className="mt-7 flex w-full min-w-0 max-w-xs justify-center sm:max-w-none">
            <Link href="/auth" className={`btn-primary w-full sm:w-auto ${focusRing}`}>
              Get started
            </Link>
          </div>
        </section>

        {/* Compact pillars */}
        <section
          aria-label="What you can do"
          className="mt-12 border-t border-teal-900/10 pt-8 sm:mt-14 sm:pt-10 animate-fade-up"
        >
          <ul className="grid min-w-0 grid-cols-1 gap-6 sm:grid-cols-3 sm:gap-0">
            {PILLARS.map((pillar, i) => (
              <li
                key={pillar.href}
                className={`min-w-0 text-center sm:px-4 ${
                  i > 0 ? "border-t border-teal-900/10 pt-6 sm:border-t-0 sm:border-l sm:pt-0" : ""
                }`}
              >
                <Link
                  href={pillar.href}
                  className={`group inline-flex flex-col items-center rounded-sm transition-colors ${focusRing}`}
                >
                  <span className="font-[family-name:var(--font-display)] text-base font-bold text-slate-800 transition-colors group-hover:text-[var(--brand)] sm:text-lg">
                    {pillar.title}
                  </span>
                  <span className="mt-1 max-w-[14rem] text-sm leading-snug text-[var(--muted)] transition-colors group-hover:text-slate-600">
                    {pillar.blurb}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>

        {/* How it works — Ask → Match → Answer */}
        <section
          aria-labelledby="how-it-works-heading"
          className="mt-10 border-t border-teal-900/10 pt-8 sm:mt-12 sm:pt-9 animate-fade-up"
        >
          <h2
            id="how-it-works-heading"
            className="text-center font-[family-name:var(--font-display)] text-base font-bold text-slate-800 sm:text-lg"
          >
            How it works
          </h2>
          <ol className="mt-5 grid min-w-0 grid-cols-1 gap-5 sm:mt-6 sm:grid-cols-3 sm:gap-0">
            {STEPS.map((step, i) => (
              <li
                key={step.title}
                className={`min-w-0 text-center sm:px-4 ${
                  i > 0 ? "border-t border-teal-900/10 pt-5 sm:border-t-0 sm:border-l sm:pt-0" : ""
                }`}
              >
                <p className="text-xs font-medium uppercase tracking-wide text-[var(--brand)]">
                  {i + 1}. {step.title}
                </p>
                <p className="mt-1.5 max-w-[14rem] mx-auto text-sm leading-snug text-[var(--muted)]">
                  {step.blurb}
                </p>
              </li>
            ))}
          </ol>
        </section>
      </main>
    </div>
  );
}
