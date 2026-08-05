import type { Metadata } from "next";
import { PublicPage, PublicSection } from "@/components/public-page";

export const metadata: Metadata = {
  title: "Contact · Cohortly",
  description:
    "Reach the Cohortly team for support, data deletion, reporting misuse, or partnership.",
};

export default function ContactPage() {
  return (
    <PublicPage
      title="Contact"
      description="We read every message. Tell us what you need and we will get back to you."
    >
      <PublicSection title="Email">
        <p>
          <a
            href="mailto:cohortly.in@gmail.com"
            className="font-semibold text-[var(--brand)] hover:text-[var(--brand-dark)] hover:underline"
          >
            cohortly.in@gmail.com
          </a>
        </p>
      </PublicSection>

      <PublicSection title="What to email about">
        <ul className="list-disc space-y-2 pl-5">
          <li>
            <span className="font-semibold text-slate-800">Support</span> —
            account access, bugs, or something that looks broken
          </li>
          <li>
            <span className="font-semibold text-slate-800">Data deletion</span>{" "}
            — request to delete your account and associated data
          </li>
          <li>
            <span className="font-semibold text-slate-800">Reporting misuse</span>{" "}
            — spam, harassment, fake profiles, or anything that feels off
          </li>
          <li>
            <span className="font-semibold text-slate-800">Partnership</span> —
            campus groups, alumni networks, or other collaborations
          </li>
        </ul>
      </PublicSection>

      <PublicSection title="Expected response time">
        <p>
          We usually reply within 2–3 business days. Urgent safety or misuse
          reports are prioritized as soon as we see them.
        </p>
      </PublicSection>
    </PublicPage>
  );
}
