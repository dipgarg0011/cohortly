import Link from "next/link";
import { ContentPage, ContentSection } from "@/components/content-page";

export type FeaturePageProps = {
  headline: string;
  intro: string[];
  steps: { title: string; body: string }[];
  asker: { title: string; body: string };
  helper: { title: string; body: string };
  ctaLabel?: string;
};

export function FeaturePage({
  headline,
  intro,
  steps,
  asker,
  helper,
  ctaLabel = "Join with your college email",
}: FeaturePageProps) {
  return (
    <ContentPage title={headline}>
      <div className="space-y-3.5">
        {intro.map((paragraph) => (
          <p key={paragraph.slice(0, 48)}>{paragraph}</p>
        ))}
      </div>

      <ContentSection id="how-it-works" title="How it works">
        <ol className="list-decimal space-y-3 pl-5">
          {steps.map((step) => (
            <li key={step.title}>
              <span className="font-semibold text-slate-800">{step.title}.</span>{" "}
              {step.body}
            </li>
          ))}
        </ol>
      </ContentSection>

      <ContentSection id="both-sides" title="Both sides of the ask">
        <h3>{asker.title}</h3>
        <p>{asker.body}</p>
        <h3>{helper.title}</h3>
        <p>{helper.body}</p>
      </ContentSection>

      <div className="rounded-xl border border-teal-900/10 bg-white/80 px-5 py-6 text-center sm:px-8">
        <p className="font-[family-name:var(--font-display)] text-lg font-bold tracking-tight text-slate-900 sm:text-xl">
          Ready to join your college network?
        </p>
        <p className="mx-auto mt-2 max-w-md text-sm leading-relaxed text-[var(--muted)] sm:text-[0.95rem]">
          Sign up with your college email. Cohortly stays limited to verified
          students and graduates at your college.
        </p>
        <Link
          href="/auth"
          className="mt-5 inline-flex rounded-xl bg-[var(--brand)] px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-[var(--brand-dark)]"
        >
          {ctaLabel}
        </Link>
      </div>
    </ContentPage>
  );
}
