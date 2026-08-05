import type { Metadata } from "next";
import { PublicPage, PublicSection } from "@/components/public-page";

export const metadata: Metadata = {
  title: "Privacy Policy · Cohortly",
  description:
    "How Cohortly collects, stores, and uses your data — in plain language.",
};

export default function PrivacyPage() {
  return (
    <PublicPage
      title="Privacy Policy"
      description="This explains what we collect and why, in plain language."
    >
      <div
        role="note"
        className="rounded-xl border border-amber-300/80 bg-amber-50 px-4 py-3 text-sm leading-relaxed text-amber-950"
      >
        <p className="font-bold text-amber-900">Before public launch</p>
        <p className="mt-1">
          Have this privacy policy reviewed by a lawyer before a public launch.
          This page is written in plain language for early members — it is not
          formal legal advice.
        </p>
      </div>

      <p className="text-xs font-medium uppercase tracking-wider text-slate-500">
        Last updated: August 5, 2026
      </p>

      <PublicSection title="What we collect">
        <p>When you use Cohortly, we may collect:</p>
        <ul className="list-disc space-y-1.5 pl-5">
          <li>Your name and college email</li>
          <li>Batch year and branch / department</li>
          <li>Profile details you choose to add (bio, role, company, skills, links)</li>
          <li>Messages you send on the platform</li>
          <li>Resumes or files you upload</li>
        </ul>
      </PublicSection>

      <PublicSection title="Why we collect it">
        <p>
          We use this information to run the network: show you relevant people,
          match mentorship and referral requests, enable messaging, and keep the
          community limited to verified members of your college.
        </p>
      </PublicSection>

      <PublicSection title="Where it is stored">
        <p>
          Data is stored on Supabase (Postgres), with access controlled by
          authentication and row-level security policies.
        </p>
      </PublicSection>

      <PublicSection title="Who can see it">
        <p>
          Profile information is visible to verified members of the same
          college. Resumes are only shared with people you choose to share them
          with — not broadcast to the whole network.
        </p>
      </PublicSection>

      <PublicSection title="What we do not do">
        <p>
          We do not sell your data or share it with advertisers.
        </p>
      </PublicSection>

      <PublicSection title="Cookies and sessions">
        <p>
          We use cookies and session storage so you can stay signed in securely.
          These are for login and session management, not advertising.
        </p>
      </PublicSection>

      <PublicSection title="Deleting your account and data">
        <p>
          To request deletion of your account and associated data, email{" "}
          <a
            href="mailto:cohortly.in@gmail.com"
            className="font-semibold text-[var(--brand)] hover:text-[var(--brand-dark)] hover:underline"
          >
            cohortly.in@gmail.com
          </a>{" "}
          from the address on your account. We will confirm and process the
          request.
        </p>
      </PublicSection>

      <PublicSection title="Questions">
        <p>
          Privacy questions go to the same address:{" "}
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
