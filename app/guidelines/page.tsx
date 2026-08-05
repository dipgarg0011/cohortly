import type { Metadata } from "next";
import { ContentPage, ContentSection } from "@/components/content-page";

export const metadata: Metadata = {
  title: "Community Guidelines · Cohortly",
  description:
    "How we treat each other on Cohortly — short, human community guidelines.",
};

export default function GuidelinesPage() {
  return (
    <ContentPage
      title="Community Guidelines"
      description="Cohortly works when people help each other without pressure. These habits keep the network worth belonging to."
      lastUpdated="August 5, 2026"
    >
      <ContentSection id="when-you-ask" title="When you ask for help">
        <p>
          Be specific. Vague asks get ignored — not out of unkindness, but
          because people do not know how to help. Say what you need, what you
          have already tried, and what a useful answer would look like.
        </p>
        <p>
          Respect someone&apos;s time. A clear ask, a short context line, and a
          realistic ask (advice, a resume read, a referral if they are open)
          goes further than a long dump of anxiety. If you send a resume, make
          sure it is the version you want them to see.
        </p>
        <p>
          One thoughtful request beats five follow-ups. Give people room to
          reply — or to pass.
        </p>
      </ContentSection>

      <ContentSection
        id="when-asked"
        title="When you're asked for help"
      >
        <p>
          You are volunteering. Mentorship, referrals, and intros are gifts of
          attention, not obligations. It is always fine to say no, to say
          &quot;not this week,&quot; or to point someone somewhere better.
        </p>
        <p>
          If you can help, be honest about what you can offer. A short, useful
          reply beats silence when you meant to answer — and a clear decline
          beats leaving someone waiting forever.
        </p>
        <p>
          Graduates can pause mentorship or limit how they show up. Students
          should treat those settings as real boundaries, not a challenge.
        </p>
      </ContentSection>

      <ContentSection id="sharing-privacy" title="Sharing and privacy">
        <p>
          Trust is the product. Do not share someone else&apos;s resume, phone
          number, email, or private messages outside Cohortly without their
          clear permission.
        </p>
        <p>
          Screenshots of private chats do not belong on social media. If you
          need to report a problem to us, forward what we need by email — do not
          publicly expose the other person.
        </p>
      </ContentSection>

      <ContentSection id="posting-opportunities" title="Posting opportunities">
        <p>
          Only post roles or leads you can stand behind. Say what you know and
          what you do not. If you are not affiliated with the company, say that.
          If the role might already be filled, say that too.
        </p>
        <p>
          Do not post fake listings, bait, or anything designed to harvest
          resumes for an unrelated purpose. Members treat opportunities as peer
          leads — keep that trust intact.
        </p>
      </ContentSection>

      <ContentSection id="if-something-goes-wrong" title="If something goes wrong">
        <p>
          Spam, pressure, fake profiles, misuse of a resume, harassment — if
          something feels off, tell us. Email{" "}
          <a href="mailto:cohortly.in@gmail.com">cohortly.in@gmail.com</a> with
          what happened and any links or names that help us investigate.
        </p>
        <p>
          Looking out for each other is part of being in this network. Reporting
          in good faith will not be held against you.
        </p>
      </ContentSection>
    </ContentPage>
  );
}
