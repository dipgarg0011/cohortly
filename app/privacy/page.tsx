import type { Metadata } from "next";
import { ContentPage, ContentSection } from "@/components/content-page";

export const metadata: Metadata = {
  title: "Privacy Policy · Cohortly",
  description:
    "How Cohortly collects, stores, and uses your data — in plain language.",
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
  { id: "contact", label: "Contact" },
] as const;

export default function PrivacyPage() {
  return (
    <ContentPage
      title="Privacy Policy"
      description="This page explains what Cohortly collects, why we collect it, who can see it, and how you can ask us to change or delete it. It is written in plain English for members of your college network."
      lastUpdated="August 5, 2026"
      toc={[...TOC]}
    >
      <div
        role="note"
        className="rounded-xl border border-amber-300/80 bg-amber-50 px-4 py-3 text-sm leading-relaxed text-amber-950"
      >
        <p className="font-bold text-amber-900">Before public launch</p>
        <p className="mt-1">
          Have this privacy policy reviewed by a qualified professional before a
          public launch. This page is intended as clear product documentation for
          early members — it is not formal legal advice.
        </p>
      </div>

      <ContentSection id="introduction" number={1} title="Introduction">
        <p>
          Cohortly is a private network for students and graduates at your
          college. To run that network we need some information about you —
          enough to verify that you belong, show you relevant people, and let
          you message mentors, request referrals, and share opportunities.
        </p>
        <p>
          We do not sell your personal data. We do not use it for advertising
          networks. If something here is unclear, email{" "}
          <a href="mailto:cohortly.in@gmail.com">cohortly.in@gmail.com</a> and
          we will explain it in plain language.
        </p>
      </ContentSection>

      <ContentSection id="what-we-collect" number={2} title="What we collect">
        <p>
          Depending on how you use Cohortly, we may collect the following. Each
          category includes why we need it.
        </p>
        <h3>Account and identity</h3>
        <p>
          Your name, college email address, and authentication details from your
          sign-in provider. We use these to create your account, verify that you
          have a college email, and keep you signed in securely.
        </p>
        <h3>Profile details</h3>
        <p>
          Batch year, branch or department, role (for example student or
          graduate), bio, company, skills, and links you choose to add. We use
          these so members of your college can find people who are relevant to
          their questions and goals.
        </p>
        <h3>Messages and requests</h3>
        <p>
          Mentorship asks, referral requests, opportunity applications, and
          messages you send inside Cohortly. We store these so conversations and
          matches can work, and so you and the other person can see the history
          of an exchange.
        </p>
        <h3>Files you upload</h3>
        <p>
          Resumes or other files you attach when requesting a referral or
          sharing materials. We store them only to deliver them to the people
          you choose to share them with — not to broadcast them to the whole
          network.
        </p>
        <h3>Technical and session data</h3>
        <p>
          Basic session and security information needed to keep you logged in
          and protect accounts (for example cookies and tokens). We use this for
          authentication and abuse prevention, not for advertising.
        </p>
      </ContentSection>

      <ContentSection
        id="how-we-use"
        number={3}
        title="How we use your information"
      >
        <p>We use the information above to:</p>
        <ul>
          <li>Verify college-email membership and keep the network private</li>
          <li>
            Show directories, mentor lists, and suggested people inside your
            college
          </li>
          <li>
            Route mentorship and referral requests to people who are in a
            position to help
          </li>
          <li>Power messaging and conversation context between members</li>
          <li>
            Display opportunities shared by members and let others respond
          </li>
          <li>
            Respond to support, safety, and data requests you send us
          </li>
          <li>
            Improve reliability and fix bugs (for example understanding why a
            request failed to deliver)
          </li>
        </ul>
        <p>
          We do not sell your data, rent mailing lists, or place third-party
          advertising trackers for behavioural ads.
        </p>
      </ContentSection>

      <ContentSection
        id="who-can-see"
        number={4}
        title="Who can see your information"
      >
        <p>
          Profile information that you put on your Cohortly profile is visible
          to verified members of the same college. People outside your college
          cannot browse the network.
        </p>
        <p>
          Mentorship asks, referral requests, and messages are visible to the
          people involved in that exchange — not to the whole college by
          default. Resumes and attachments are shared only with recipients you
          choose when you send a request.
        </p>
        <p>
          A small number of Cohortly builders may access data when needed to
          operate the service, investigate abuse, or respond to your support
          request. We do not share personal data with advertisers.
        </p>
      </ContentSection>

      <ContentSection id="storage" number={5} title="Storage and protection">
        <p>
          Cohortly stores data in a hosted Postgres database (Supabase), with
          access controlled by authentication and row-level security policies.
          Files you upload are stored in associated object storage with
          restricted access.
        </p>
        <p>
          We use industry-standard protections for a product of this stage —
          encrypted connections (HTTPS), authenticated sessions, and
          database-level access rules. No system is perfectly secure; if we
          learn of a breach that affects your personal data, we will notify
          affected members as promptly as we reasonably can.
        </p>
      </ContentSection>

      <ContentSection id="retention" number={6} title="Retention and deletion">
        <p>
          We keep your account and content while your account is active so the
          network and your conversations continue to work. If you ask us to
          delete your account, we will remove or anonymise personal data that
          identifies you, except where we must retain limited records (for
          example to investigate abuse or meet a legal obligation).
        </p>
        <p>
          To request deletion, email{" "}
          <a href="mailto:cohortly.in@gmail.com">cohortly.in@gmail.com</a> from
          the college email on your account and ask us to delete your Cohortly
          account and associated data. We will confirm receipt and process the
          request.
        </p>
      </ContentSection>

      <ContentSection id="your-rights" number={7} title="Your rights">
        <p>
          You can ask us to access, correct, or delete personal data we hold
          about you, or to explain how it is used. Send the request to{" "}
          <a href="mailto:cohortly.in@gmail.com">cohortly.in@gmail.com</a> from
          the email on your account so we can verify it is you.
        </p>
        <p>
          We aim to respond within 14 days. Complex requests may take longer; if
          so, we will tell you that we received the request and when to expect a
          fuller answer.
        </p>
      </ContentSection>

      <ContentSection id="cookies" number={8} title="Cookies and sessions">
        <p>
          We use cookies and similar storage so you can stay signed in and so
          the site can remember a secure session. These are for login, security,
          and basic product function — not for third-party advertising.
        </p>
        <p>
          If you clear cookies or sign out, you will need to sign in again to
          use private parts of Cohortly.
        </p>
      </ContentSection>

      <ContentSection id="minors" number={9} title="Minors">
        <p>
          Cohortly is intended for college students and graduates who can form a
          binding agreement under applicable law. If you are under 18, use the
          service only with a parent or guardian&apos;s involvement where that
          is required.
        </p>
        <p>
          If you believe someone under the appropriate age has created an
          account without required consent, email{" "}
          <a href="mailto:cohortly.in@gmail.com">cohortly.in@gmail.com</a> and
          we will look into it.
        </p>
      </ContentSection>

      <ContentSection id="changes" number={10} title="Changes to this policy">
        <p>
          We may update this privacy policy as Cohortly grows. When we make
          material changes, we will update the &quot;Last updated&quot; date on
          this page and, when practical, notify members through the product or
          email.
        </p>
        <p>
          Continued use of Cohortly after an update means you accept the revised
          policy. If you disagree, you can stop using the service and request
          account deletion.
        </p>
      </ContentSection>

      <ContentSection id="contact" number={11} title="Contact">
        <p>
          Privacy questions, access requests, and deletion requests:{" "}
          <a href="mailto:cohortly.in@gmail.com">cohortly.in@gmail.com</a>.
        </p>
        <p>
          Please include enough detail for us to find your account (usually the
          college email you signed up with) and what you need us to do.
        </p>
      </ContentSection>
    </ContentPage>
  );
}
