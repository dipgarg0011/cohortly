import Link from "next/link";
import { redirect } from "next/navigation";
import { BrandLogo } from "@/components/brand-logo";
import { createClient } from "@/lib/supabase/server";

const PILLARS = [
  {
    href: "/network",
    title: "Network",
    blurb: "Stay connected with batchmates and alumni.",
  },
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
    title: "Connect",
    blurb: "Find people from your college — classmates, seniors, alumni.",
  },
  {
    title: "Ask",
    blurb: "Reach out for advice, intros, or just to stay in touch.",
  },
  {
    title: "Help",
    blurb: "Share what you know and keep the community strong.",
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
            Your private college community — stay connected with batchmates and
            alumni after graduation.
          </p>
          <p className="mt-2 max-w-sm text-sm text-[var(--muted)]">
            For students and graduates at your college.
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
          <ul className="grid min-w-0 grid-cols-2 gap-x-4 gap-y-6 sm:grid-cols-4 sm:gap-0">
            {PILLARS.map((pillar, i) => (
              <li
                key={pillar.href}
                className={`min-w-0 text-center sm:px-3 ${
                  i > 0
                    ? "sm:border-l sm:border-teal-900/10"
                    : ""
                } ${
                  i >= 2 ? "border-t border-teal-900/10 pt-6 sm:border-t-0 sm:pt-0" : ""
                }`}
              >
                <Link
                  href={pillar.href}
                  className={`group inline-flex flex-col items-center rounded-sm transition-colors ${focusRing}`}
                >
                  <span className="font-[family-name:var(--font-display)] text-base font-bold text-slate-800 transition-colors group-hover:text-[var(--brand)] sm:text-lg">
                    {pillar.title}
                  </span>
                  <span className="mt-1 max-w-[11rem] text-sm leading-snug text-[var(--muted)] transition-colors group-hover:text-slate-600">
                    {pillar.blurb}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>

        {/* How it works — Connect → Ask → Help */}
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
