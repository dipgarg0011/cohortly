import type { Metadata } from "next";
import { PublicPage, PublicSection } from "@/components/public-page";

export const metadata: Metadata = {
  title: "Community Guidelines · Cohortly",
  description:
    "How we treat each other on Cohortly — short, human community guidelines.",
};

export default function GuidelinesPage() {
  return (
    <PublicPage
      title="Community Guidelines"
      description="Cohortly works when people help each other without pressure. These are the habits that keep the network worth belonging to."
    >
      <PublicSection title="Be specific when you ask">
        <p>
          Vague asks get ignored — not out of unkindness, but because people
          don&apos;t know how to help. Say what you need, what you&apos;ve
          already tried, and what a useful answer would look like. A clear ask
          respects someone&apos;s time.
        </p>
      </PublicSection>

      <PublicSection title="A “no” is fine">
        <p>
          Nobody owes anyone a referral, an intro, or a long reply. Mentors and
          alumni are volunteering. Accept a pass gracefully — it keeps the door
          open for the next person, and for you later.
        </p>
      </PublicSection>

      <PublicSection title="Keep private things private">
        <p>
          Don&apos;t share someone&apos;s resume, contact details, or messages
          outside Cohortly without their clear permission. Trust is the product.
        </p>
      </PublicSection>

      <PublicSection title="Only post what you can vouch for">
        <p>
          Don&apos;t post opportunities you can&apos;t stand behind. If you
          share a role or lead, be honest about what you know — and what you
          don&apos;t.
        </p>
      </PublicSection>

      <PublicSection title="Report anything that feels off">
        <p>
          Spam, pressure, fake profiles, misuse of a resume — if something
          feels wrong, tell us. Email{" "}
          <a
            href="mailto:cohortly.in@gmail.com"
            className="font-semibold text-[var(--brand)] hover:text-[var(--brand-dark)] hover:underline"
          >
            cohortly.in@gmail.com
          </a>
          . Looking out for each other is part of being in this network.
        </p>
      </PublicSection>
    </PublicPage>
  );
}
