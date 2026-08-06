import type { Metadata } from "next";
import { ContentPage } from "@/components/content-page";

export const metadata: Metadata = {
  title: "Contact · Cohortly",
  description:
    "Questions, feedback, bug reports, or interested in bringing Cohortly to your college.",
};

const MAILTO_LINKS = [
  {
    href: "mailto:cohortly.in@gmail.com?subject=Bug%20report",
    label: "Something not working? Tell us what happened.",
  },
  {
    href: "mailto:cohortly.in@gmail.com?subject=New%20college%20interest",
    label: "Want to bring Cohortly to your college?",
  },
  {
    href: "mailto:cohortly.in@gmail.com?subject=Safety%20report",
    label: "Safety concern about another member?",
  },
] as const;

export default function ContactPage() {
  return (
    <ContentPage
      title="Contact Cohortly"
      description="Questions, feedback, bug reports, or interested in bringing Cohortly to your college? We read every message."
      showBackToTop={false}
    >
      <div className="mx-auto max-w-xl text-center sm:text-left">
        <p className="text-base leading-relaxed text-slate-700 sm:text-[1.05rem]">
          Email:{" "}
          <a
            href="mailto:cohortly.in@gmail.com"
            className="font-semibold text-[var(--brand)] hover:text-[var(--brand-dark)] hover:underline"
          >
            cohortly.in@gmail.com
          </a>
        </p>
        <p className="mt-2 text-sm leading-relaxed text-[var(--muted)] sm:text-base">
          We typically respond within 2–3 days.
        </p>

        <ul className="mt-8 space-y-3 text-left">
          {MAILTO_LINKS.map(({ href, label }) => (
            <li key={href}>
              <a
                href={href}
                className="text-sm font-semibold text-[var(--brand)] transition hover:text-[var(--brand-dark)] hover:underline sm:text-[0.95rem]"
              >
                {label}
              </a>
            </li>
          ))}
        </ul>
      </div>
    </ContentPage>
  );
}
