import type { Metadata } from "next";
import { ContentPage, ContentSection } from "@/components/content-page";

export const metadata: Metadata = {
  title: "Terms of Use · Cohortly",
  description:
    "Who may join Cohortly, expected conduct, and the limits of the platform.",
};

const TOC = [
  { id: "acceptance", label: "Acceptance of these terms" },
  { id: "eligibility", label: "Eligibility" },
  { id: "acceptable-use", label: "Acceptable use" },
  { id: "prohibited", label: "Prohibited conduct" },
  { id: "voluntary-help", label: "Voluntary referrals and mentorship" },
  { id: "opportunities", label: "Unverified opportunities" },
  { id: "content-licence", label: "Your content and licence" },
  { id: "suspension", label: "Suspension and removal" },
  { id: "disclaimers", label: "Disclaimers" },
  { id: "liability", label: "Limitation of liability" },
  { id: "governing-law", label: "Governing law" },
  { id: "changes-contact", label: "Changes and contact" },
] as const;

export default function TermsPage() {
  return (
    <ContentPage
      title="Terms of Use"
      description="These terms explain who may use Cohortly, how we expect people to behave, and what the platform does and does not promise. By creating an account or using the service, you agree to them."
      lastUpdated="August 5, 2026"
      toc={[...TOC]}
    >
      <ContentSection
        id="acceptance"
        number={1}
        title="Acceptance of these terms"
      >
        <p>
          By signing up for or using Cohortly, you agree to these Terms of Use
          and to our{" "}
          <a href="/privacy">Privacy Policy</a> and{" "}
          <a href="/guidelines">Community Guidelines</a>. If you do not agree,
          do not use the service.
        </p>
      </ContentSection>

      <ContentSection id="eligibility" number={2} title="Eligibility">
        <p>
          Cohortly is for current students and graduates of your college who can
          verify with a college email address. Access is limited so the network
          stays a trusted campus community rather than an open public forum.
        </p>
        <p>
          You must provide accurate information when you create your profile and
          keep it reasonably up to date. You are responsible for activity under
          your account.
        </p>
      </ContentSection>

      <ContentSection id="acceptable-use" number={3} title="Acceptable use">
        <p>
          Use Cohortly to connect with people from your college, ask for advice,
          offer help when you can, share opportunities you can stand behind, and
          treat other members with respect. Follow the Community Guidelines —
          they are part of how we expect the product to be used.
        </p>
      </ContentSection>

      <ContentSection id="prohibited" number={4} title="Prohibited conduct">
        <p>You agree not to:</p>
        <ul>
          <li>
            Harass, threaten, discriminate against, or spam other members
          </li>
          <li>
            Misrepresent who you are, your college affiliation, or your role
          </li>
          <li>
            Share someone else&apos;s resume, contact details, or private
            messages without their clear permission
          </li>
          <li>
            Scrape, bulk-export, or misuse the directory for cold outreach
            outside the product&apos;s purpose
          </li>
          <li>
            Post malware, phishing links, or knowingly false opportunity
            listings
          </li>
          <li>
            Attempt to bypass access controls or interfere with the service
          </li>
        </ul>
      </ContentSection>

      <ContentSection
        id="voluntary-help"
        number={5}
        title="Voluntary referrals and mentorship"
      >
        <p>
          Mentorship, referrals, introductions, and advice on Cohortly are
          voluntary. Nobody is required to accept a request, write a referral,
          sit on a call, or guarantee an interview or job. A polite &quot;no&quot;
          or silence after a fair window is a valid outcome.
        </p>
        <p>
          Do not pressure, guilt, or repeatedly chase someone who has declined
          or not responded. Helpers may pause mentorship or limit how they show
          up in the product; respect those boundaries.
        </p>
      </ContentSection>

      <ContentSection
        id="opportunities"
        number={6}
        title="Unverified opportunities"
      >
        <p>
          Cohortly does not vet job postings, internship listings, or other
          opportunities shared by members. Treat them as leads from peers.
          Verify employers, roles, and links yourself before you apply, share
          personal information, or make decisions based on them.
        </p>
        <p>
          Cohortly is not an employer, recruiter, or placement agency, and does
          not guarantee that any listing is accurate, open, or lawful.
        </p>
      </ContentSection>

      <ContentSection
        id="content-licence"
        number={7}
        title="Your content and licence"
      >
        <p>
          You keep ownership of the content you post — profile text, asks,
          messages, opportunity listings, and files you upload. You are
          responsible for having the rights to share that content.
        </p>
        <p>
          By posting on Cohortly, you grant us a limited licence to host, store,
          display, and transmit that content as needed to operate the service
          for members of your college (for example showing your profile in the
          directory or delivering a message you send). We do not claim ownership
          of your content, and we will not sell it as a standalone product.
        </p>
      </ContentSection>

      <ContentSection id="suspension" number={8} title="Suspension and removal">
        <p>
          We may suspend, limit, or remove accounts that misuse the platform,
          violate these terms or the Community Guidelines, or put other members
          at risk. We may also remove content that appears harmful, unlawful, or
          misleading.
        </p>
        <p>
          Serious abuse may be reported to relevant authorities when
          appropriate. If you believe an action on your account was a mistake,
          email{" "}
          <a href="mailto:cohortly.in@gmail.com">cohortly.in@gmail.com</a>.
        </p>
      </ContentSection>

      <ContentSection id="disclaimers" number={9} title="Disclaimers">
        <p>
          Cohortly is provided on an &quot;as is&quot; and &quot;as
          available&quot; basis. We do not warrant that the service will be
          uninterrupted, error-free, or that mentorship, referrals, or
          opportunities will lead to any particular outcome.
        </p>
        <p>
          Member profiles, advice, and listings come from other people. Use your
          judgment. We are not responsible for offline interactions you arrange
          through the platform.
        </p>
      </ContentSection>

      <ContentSection id="liability" number={10} title="Limitation of liability">
        <p>
          To the fullest extent permitted by law, Cohortly and its builders are
          not liable for direct, indirect, incidental, special, consequential,
          or punitive damages arising from your use of the service, including
          outcomes of mentorship, referrals, hiring decisions, or interactions
          between members.
        </p>
        <p>
          Some jurisdictions do not allow certain limitations; in those cases,
          our liability is limited to the maximum extent the law allows.
        </p>
      </ContentSection>

      <ContentSection id="governing-law" number={11} title="Governing law">
        <p>
          These terms are governed by the laws of India, without regard to
          conflict-of-law rules. Courts in India shall have jurisdiction over
          disputes arising from these terms or your use of Cohortly, subject to
          any mandatory consumer protections that apply to you.
        </p>
      </ContentSection>

      <ContentSection
        id="changes-contact"
        number={12}
        title="Changes and contact"
      >
        <p>
          We may update these terms as the product evolves. When we make
          material changes, we will update the &quot;Last updated&quot; date on
          this page and, when practical, notify members through the product or
          email. Continued use after an update means you accept the revised
          terms.
        </p>
        <p>
          Questions about these terms:{" "}
          <a href="mailto:cohortly.in@gmail.com">cohortly.in@gmail.com</a>.
        </p>
      </ContentSection>
    </ContentPage>
  );
}
