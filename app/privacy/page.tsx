import type { Metadata } from "next";
import { ContentPage, ContentSection } from "@/components/content-page";

export const metadata: Metadata = {
  title: "Privacy Policy · Cohortly",
  description:
    "What Cohortly collects, why we collect it, who can see it, and how you can ask us to change or delete it.",
};

const TOC = [
  { id: "introduction", label: "Introduction" },
  { id: "what-we-collect", label: "What we collect" },
  { id: "how-we-use", label: "How we use your information" },
  { id: "who-can-see", label: "Who can see your information" },
  { id: "storage", label: "Storage and protection" },
  { id: "retention", label: "Retention and deletion" },
  { id: "your-rights", label: "Your rights" },
  { id: "cookies", label: "Cookies and sessions" },
  { id: "minors", label: "Minors" },
  { id: "changes", label: "Changes to this policy" },
  { id: "contact", label: "Contact us" },
] as const;

export default function PrivacyPage() {
  return (
    <ContentPage
      title="Privacy Policy"
      description="This page explains what Cohortly collects, why we collect it, who can see it, and how you can ask us to change or delete it. It is written in plain English for members of your college network."
      lastUpdated="August 6, 2026"
      toc={[...TOC]}
    >
      <ContentSection id="introduction" number={1} title="Introduction">
        <p>
          Cohortly (&quot;we,&quot; &quot;us,&quot; &quot;Cohortly&quot;) operates
          a private networking platform for students and graduates of
          participating colleges. This policy applies to anyone who creates an
          account, whether you are a current student, a graduate, or an
          administrator of your college&apos;s network. We built Cohortly to be
          used inside a trusted, verified community. This policy explains what
          that trust is based on.
        </p>
      </ContentSection>

      <ContentSection id="what-we-collect" number={2} title="What we collect">
        <p>
          Account information (name, college email, batch/graduation year,
          department); profile information you choose to add (company, role,
          skills, past companies, what you&apos;re open to, profile photo);
          content you create (messages, mentorship requests/answers, referral
          requests, opportunity posts/applications, help requests); usage
          information (last active, used to show accurate availability);
          technical information (IP address, browser/device, for security and
          abuse prevention). We do not collect information beyond what&apos;s
          needed for these features.
        </p>
      </ContentSection>

      <ContentSection
        id="how-we-use"
        number={3}
        title="How we use your information"
      >
        <p>
          To operate core features (matching, routing, showing your profile to
          verified members); to prevent spam and abuse; to send relevant
          notifications; to improve the product using aggregated, de-identified
          usage patterns — we do not read your private messages to do this. We
          do not sell your data, share it with advertisers, or use it to train
          third-party AI models.
        </p>
      </ContentSection>

      <ContentSection
        id="who-can-see"
        number={4}
        title="Who can see your information"
      >
        <p>
          Other verified members of your college network see your public profile
          info. The other participant in a conversation sees your messages —
          nobody else can read them. Nobody outside your verified college
          network can see your profile, requests, or activity; Cohortly is not
          indexed by search engines. We may disclose information if required by
          law or to protect user safety, and will try to notify you first unless
          legally prohibited.
        </p>
      </ContentSection>

      <ContentSection id="storage" number={5} title="Storage and protection">
        <p>
          Data is stored with Supabase using industry-standard encryption in
          transit and at rest. Access to production data is restricted to the
          founder for platform maintenance. Row-level security policies restrict
          access by default to data members are authorized to see.
        </p>
      </ContentSection>

      <ContentSection
        id="retention"
        number={6}
        title="Retention and deletion"
      >
        <p>
          Data is retained while your account is active. If you delete your
          account, profile and personal content are deleted within 30 days,
          except limited records we&apos;re required to retain for legal or
          safety-investigation purposes.
        </p>
      </ContentSection>

      <ContentSection id="your-rights" number={7} title="Your rights">
        <p>
          You can access, correct, or request deletion of your data, and ask
          what we&apos;ve collected and why. Email{" "}
          <a href="mailto:cohortly.in@gmail.com">cohortly.in@gmail.com</a>; we
          respond within 30 days. If you&apos;re in India, these rights are
          additionally protected under the Digital Personal Data Protection Act,
          2023.
        </p>
      </ContentSection>

      <ContentSection id="cookies" number={8} title="Cookies and sessions">
        <p>
          We use essential cookies to keep you signed in and remember your
          session. No third-party advertising or tracking cookies.
        </p>
      </ContentSection>

      <ContentSection id="minors" number={9} title="Minors">
        <p>
          Cohortly is intended for current college students and graduates. If
          you believe a minor created an account without appropriate
          authorization, contact{" "}
          <a href="mailto:cohortly.in@gmail.com">cohortly.in@gmail.com</a>.
        </p>
      </ContentSection>

      <ContentSection
        id="changes"
        number={10}
        title="Changes to this policy"
      >
        <p>
          We may update this policy as Cohortly grows. Material changes will be
          communicated by email or in-app notice before taking effect.
        </p>
      </ContentSection>

      <ContentSection id="contact" number={11} title="Contact us">
        <p>
          Questions about this policy or your data:{" "}
          <a href="mailto:cohortly.in@gmail.com">cohortly.in@gmail.com</a>.
        </p>
      </ContentSection>
    </ContentPage>
  );
}
