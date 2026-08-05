import type { Metadata } from "next";
import { ContentPage, ContentSection } from "@/components/content-page";

export const metadata: Metadata = {
  title: "Contact · Cohortly",
  description:
    "Reach the Cohortly team for support, data deletion, reporting misuse, or partnership.",
};

export default function ContactPage() {
  return (
    <ContentPage
      title="Contact"
      description="We read every message. Tell us what you need and we will get back to you."
      showBackToTop={false}
    >
      <ContentSection id="email" title="Email">
        <p>
          Write to{" "}
          <a href="mailto:cohortly.in@gmail.com">cohortly.in@gmail.com</a>.
          That is the best way to reach us for support, privacy requests, and
          campus partnerships.
        </p>
      </ContentSection>

      <ContentSection id="what-to-write" title="What to write about">
        <ul>
          <li>
            <span className="font-semibold text-slate-800">Support</span> —
            account access, bugs, or something that looks broken
          </li>
          <li>
            <span className="font-semibold text-slate-800">Data deletion</span> —
            request to delete your account and associated data (use the email on
            your account)
          </li>
          <li>
            <span className="font-semibold text-slate-800">Reporting misuse</span>{" "}
            — spam, harassment, fake profiles, or anything that feels off
          </li>
          <li>
            <span className="font-semibold text-slate-800">Partnership</span> —
            bring Cohortly to your college, alumni groups, or campus
            collaborations
          </li>
        </ul>
        <p>
          Include enough context for us to help — what you were trying to do,
          the college email on the account if relevant, and screenshots when
          they clarify a bug.
        </p>
      </ContentSection>

      <ContentSection id="response-time" title="Expected response time">
        <p>
          We usually reply within 2–3 business days. Urgent safety or misuse
          reports are prioritised as soon as we see them.
        </p>
      </ContentSection>
    </ContentPage>
  );
}
