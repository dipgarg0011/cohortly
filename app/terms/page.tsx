import type { Metadata } from "next";
import { PublicPage, PublicSection } from "@/components/public-page";

export const metadata: Metadata = {
  title: "Terms of Use · Cohortly",
  description:
    "Who may join Cohortly, expected conduct, and the limits of the platform.",
};

export default function TermsPage() {
  return (
    <PublicPage
      title="Terms of Use"
      description="The basics of using Cohortly — who can join, how we expect people to behave, and what the platform does and does not promise."
    >
      <p className="text-xs font-medium uppercase tracking-wider text-slate-500">
        Last updated: August 5, 2026
      </p>

      <PublicSection title="Who may join">
        <p>
          Cohortly is for current students and graduates of your college with a
          verified college email. Access is limited so the network stays a
          trusted campus community.
        </p>
      </PublicSection>

      <PublicSection title="Expected conduct">
        <p>
          Treat people with respect. Do not spam, harass, misrepresent yourself,
          or misuse someone else&apos;s information. Follow the{" "}
          <a
            href="/guidelines"
            className="font-semibold text-[var(--brand)] hover:text-[var(--brand-dark)] hover:underline"
          >
            Community Guidelines
          </a>
          . If something feels wrong, report it.
        </p>
      </PublicSection>

      <PublicSection title="Referrals and mentorship are voluntary">
        <p>
          Mentorship, referrals, introductions, and advice on Cohortly are
          voluntary. Nobody is required to accept a request, write a referral,
          or guarantee an outcome. A &quot;no&quot; is a valid answer.
        </p>
      </PublicSection>

      <PublicSection title="Opportunities and job postings">
        <p>
          Cohortly does not vet job postings, internship listings, or other
          opportunities shared by members. Treat them as leads from peers —
          verify details yourself before applying, sharing personal information,
          or making decisions based on them.
        </p>
      </PublicSection>

      <PublicSection title="Suspension and misuse">
        <p>
          We may suspend or remove accounts that misuse the platform, violate
          these terms or the community guidelines, or put other members at risk.
          Serious abuse may also be reported to relevant authorities when
          appropriate.
        </p>
      </PublicSection>

      <PublicSection title="Liability">
        <p>
          Cohortly is a community tool provided as-is. We are not responsible
          for outcomes of mentorship, referrals, hiring decisions, or
          interactions between members. Use your judgment. To the fullest extent
          permitted by law, Cohortly and its builders are not liable for
          indirect, incidental, or consequential damages arising from use of the
          service.
        </p>
      </PublicSection>

      <PublicSection title="Disputes and contact">
        <p>
          Questions or disputes about these terms: email{" "}
          <a
            href="mailto:cohortly.in@gmail.com"
            className="font-semibold text-[var(--brand)] hover:text-[var(--brand-dark)] hover:underline"
          >
            cohortly.in@gmail.com
          </a>
          .
        </p>
      </PublicSection>
    </PublicPage>
  );
}
