import type { Metadata } from "next";
import { ContentPage, ContentSection } from "@/components/content-page";

export const metadata: Metadata = {
  title: "Community Guidelines · Cohortly",
  description:
    "Ground rules for trusting the person on the other side of a Cohortly request.",
};

export default function GuidelinesPage() {
  return (
    <ContentPage
      title="Community Guidelines"
      description="Cohortly only works if people can trust the person on the other side of a request. These are the ground rules."
      lastUpdated="August 6, 2026"
    >
      <ContentSection
        id="why-these-exist"
        title="Why these guidelines exist"
      >
        <p>
          Cohortly connects you with real people from your college — seniors,
          classmates, and graduates who are giving their time voluntarily. These
          guidelines exist to keep that trust intact.
        </p>
      </ContentSection>

      <ContentSection id="be-who-you-are" title="Be who you say you are">
        <p>
          Use your real name and accurate college information. Don&apos;t create
          an account on someone else&apos;s behalf, and don&apos;t misrepresent
          your batch, department, or current company.
        </p>
      </ContentSection>

      <ContentSection id="respect-time" title="Respect people's time">
        <p>
          Mentors and referrers are helping voluntarily, often outside working
          hours. Keep requests specific and reasonable, respect a decline
          (silent or otherwise), and don&apos;t send repeated follow-ups if
          someone hasn&apos;t responded.
        </p>
      </ContentSection>

      <ContentSection id="no-solicitation" title="No solicitation">
        <p>
          Don&apos;t use Cohortly to sell services, request payment for
          referrals or mentorship, or promote unrelated businesses.
        </p>
      </ContentSection>

      <ContentSection
        id="opportunity-posts"
        title="Keep opportunity posts honest"
      >
        <p>
          Make sure posted details are accurate to the best of your knowledge.
          Don&apos;t post roles that don&apos;t exist or exaggerate details to
          attract applicants.
        </p>
      </ContentSection>

      <ContentSection id="report" title="Report, don't retaliate">
        <p>
          If someone makes you uncomfortable or misuses the platform, report it
          — don&apos;t respond in kind. We review every report.
        </p>
      </ContentSection>

      <ContentSection
        id="what-happens"
        title="What happens if these are broken"
      >
        <p>
          Depending on severity: a warning, restricted features, or full account
          suspension. Repeated or serious violations (harassment, fraud,
          impersonation) result in permanent removal.
        </p>
      </ContentSection>

      <ContentSection id="contact" title="Contact">
        <p>
          <a href="mailto:cohortly.in@gmail.com">cohortly.in@gmail.com</a>.
        </p>
      </ContentSection>
    </ContentPage>
  );
}
