import type { Metadata } from "next";
import { PublicPage, PublicSection } from "@/components/public-page";

export const metadata: Metadata = {
  title: "About · Cohortly",
  description:
    "What Cohortly is, why it exists, and who built this private network for IIT BHU.",
};

export default function AboutPage() {
  return (
    <PublicPage
      title="About Cohortly"
      description="A private college network so IIT BHU students and graduates can find mentors, referrals, and opportunities among people who already share a campus."
    >
      <PublicSection title="What it is">
        <p>
          Cohortly is a private network for IIT BHU students and graduates.
          Inside, you can browse people from your college, ask mentors for
          advice, request referrals, and discover opportunities posted by
          alumni and peers.
        </p>
      </PublicSection>

      <PublicSection title="Why it exists">
        <p>
          Most of the useful help in college happens through someone you almost
          know — a senior two batches ahead, a grad at a company you care about,
          a classmate who just went through the same interview. Those
          connections are hard to find when everyone is scattered across
          WhatsApp groups and LinkedIn.
        </p>
        <p>
          Cohortly keeps that network in one place, limited to verified members
          of the same college, so asking for help feels natural instead of
          cold.
        </p>
      </PublicSection>

      <PublicSection title="Who built it">
        <p>
          Cohortly is built by students, for students. We are shipping the
          tools we wished we had when we needed a mentor, a referral, or a
          honest read on an opportunity.
        </p>
      </PublicSection>

      <PublicSection title="Contact">
        <p>
          Questions, ideas, or anything else — email{" "}
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
