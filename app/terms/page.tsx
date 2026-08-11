import type { Metadata } from "next";
import Link from "next/link";
import { ContentPage, ContentSection } from "@/components/content-page";

export const metadata: Metadata = {
  title: "Terms of Use · Cohortly",
  description:
    "Who may use Cohortly, how we expect people to behave, and what the platform does and does not promise.",
};

const TOC = [
  { id: "acceptance", label: "Acceptance of these terms" },
  { id: "eligibility", label: "Eligibility" },
  { id: "acceptable-use", label: "Acceptable use" },
  { id: "prohibited", label: "Prohibited conduct" },
  { id: "voluntary", label: "Voluntary referrals and mentorship" },
  { id: "opportunities", label: "Unverified opportunities" },
  { id: "content-licence", label: "Your content and licence" },
  { id: "suspension", label: "Suspension and removal" },
  { id: "disclaimers", label: "Disclaimers" },
  { id: "liability", label: "Limitation of liability" },
  { id: "governing-law", label: "Governing law" },
  { id: "changes", label: "Changes to these terms" },
  { id: "contact", label: "Contact" },
] as const;

export default function TermsPage() {
  return (
    <ContentPage
      title="Terms of Use"
      description="These terms explain who may use Cohortly, how we expect people to behave, and what the platform does and does not promise. Cohortly is currently available to one verified college network. By creating an account or using the service, you agree to them."
      lastUpdated="August 11, 2026"
      toc={[...TOC]}
    >
      <ContentSection
        id="acceptance"
        number={1}
        title="Acceptance of these terms"
      >
        <p>
          By creating a Cohortly account or using any part of the service, you
          agree to these Terms of Use and our{" "}
          <Link href="/privacy">Privacy Policy</Link>. If you do not agree, do
          not use Cohortly.
        </p>
      </ContentSection>

      <ContentSection id="eligibility" number={2} title="Eligibility">
        <p>
          Cohortly is available to current students and graduates of the
          participating college for this launch, verified through a college
          email (or another verification method we may offer). Access is limited
          to that verified campus community — it is not an open multi-college
          directory. You must provide accurate affiliation, batch, and status
          information. Accounts with false affiliation information may be
          suspended.
        </p>
      </ContentSection>

      <ContentSection id="acceptable-use" number={3} title="Acceptable use">
        <p>
          You agree to use Cohortly to build genuine professional and mentorship
          connections within your college community, using messaging, mentorship
          requests, referral requests, and opportunity postings for their
          intended purpose.
        </p>
      </ContentSection>

      <ContentSection id="prohibited" number={4} title="Prohibited conduct">
        <p>
          Don&apos;t: impersonate another person or misrepresent
          affiliation/batch/employment; harass, spam, or repeatedly message
          members unsolicited; solicit payment for referrals, mentorship, or job
          placement; post fraudulent or misleading opportunities; scrape or
          redistribute other members&apos; data; bypass verification,
          rate-limiting, or safety features. We may suspend or remove violating
          accounts.
        </p>
      </ContentSection>

      <ContentSection
        id="voluntary"
        number={5}
        title="Voluntary referrals and mentorship"
      >
        <p>
          Referrals, advice, and introductions are given voluntarily by
          individual members at their own discretion. Cohortly does not
          guarantee any request will be answered or matched, and is not a party
          to resulting hiring decisions, referral outcomes, or mentorship
          relationships. Members are responsible for their own conduct and
          commitments.
        </p>
      </ContentSection>

      <ContentSection
        id="opportunities"
        number={6}
        title="Unverified opportunities"
      >
        <p>
          Opportunities are shared by individual members and are not verified or
          endorsed by Cohortly. We encourage members to confirm details directly
          with the posting company before applying. Cohortly is not responsible
          for the accuracy of member-posted listings.
        </p>
      </ContentSection>

      <ContentSection
        id="content-licence"
        number={7}
        title="Your content and licence"
      >
        <p>
          You retain ownership of content you post. By posting, you grant
          Cohortly a limited licence to display, store, and transmit that
          content as needed to operate the service. This licence ends when you
          delete the content or your account, subject to the retention terms in
          the Privacy Policy.
        </p>
      </ContentSection>

      <ContentSection
        id="suspension"
        number={8}
        title="Suspension and removal"
      >
        <p>
          We may suspend or terminate accounts that violate these terms, pose a
          safety risk, or were created with false information, and will notify
          the affected member where practical. Members can delete their own
          account anytime from Profile → Delete my account, or by emailing{" "}
          <a href="mailto:cohortly.in@gmail.com">cohortly.in@gmail.com</a>.
        </p>
      </ContentSection>

      <ContentSection id="disclaimers" number={9} title="Disclaimers">
        <p>
          Cohortly is provided &quot;as is.&quot; We do not guarantee
          uninterrupted or error-free service, or any particular mentorship,
          referral, or opportunity outcome. Cohortly facilitates connections
          between members — it does not employ, endorse, or vouch for any
          member, mentor, referrer, or opportunity poster.
        </p>
      </ContentSection>

      <ContentSection
        id="liability"
        number={10}
        title="Limitation of liability"
      >
        <p>
          To the fullest extent permitted by law, Cohortly and its founder are
          not liable for indirect, incidental, or consequential damages arising
          from use of the service, including outcomes of mentorship advice,
          referrals, or opportunities shared through the platform.
        </p>
      </ContentSection>

      <ContentSection id="governing-law" number={11} title="Governing law">
        <p>
          These terms are governed by the laws of India. Disputes are subject to
          the jurisdiction of the courts of India.
        </p>
      </ContentSection>

      <ContentSection
        id="changes"
        number={12}
        title="Changes to these terms"
      >
        <p>
          We may update these terms as Cohortly grows. Continued use after
          changes take effect constitutes acceptance.
        </p>
      </ContentSection>

      <ContentSection id="contact" number={13} title="Contact">
        <p>
          Questions about these terms:{" "}
          <a href="mailto:cohortly.in@gmail.com">cohortly.in@gmail.com</a>.
        </p>
      </ContentSection>
    </ContentPage>
  );
}
