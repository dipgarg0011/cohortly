import type { Metadata } from "next";
import Link from "next/link";
import { ContentPage, ContentSection } from "@/components/content-page";

export const metadata: Metadata = {
  title: "About · Cohortly",
  description:
    "A private college network so students and graduates at your college can find mentors, referrals, and opportunities.",
};

export default function AboutPage() {
  return (
    <ContentPage
      title="About Cohortly"
      description="A private college network so students and graduates at your college can find mentors, referrals, and opportunities among people who already share a campus."
      showBackToTop={false}
    >
      <ContentSection id="the-problem" title="The problem">
        <p>
          Most of the useful help in college happens through someone you almost
          know — a senior two batches ahead, a grad at a company you care about,
          a classmate who just went through the same interview. Those
          connections are hard to find when everyone is scattered across
          WhatsApp groups and LinkedIn.
        </p>
        <p>
          Cold outreach feels awkward. Group chats are noisy. The people who
          could help are busy, and the people who need help do not know whom to
          ask.
        </p>
      </ContentSection>

      <ContentSection id="what-cohortly-does" title="What Cohortly does">
        <p>
          Cohortly puts your college network in one place. Inside, verified
          students and graduates can browse people from the same college, ask
          mentors for advice, request referrals from alumni at companies
          they&apos;re targeting, and post or apply to opportunities shared by
          people they actually have something in common with.
        </p>
        <p>
          Everything is scoped to your college. Nobody outside your verified
          network can see your profile, your requests, or your messages.
        </p>
      </ContentSection>

      <ContentSection id="how-it-works" title="How it works">
        <ul>
          <li>
            <span className="font-semibold text-slate-800">Mentors</span> —
            post what you need help with, and Cohortly routes it to graduates
            who are the best fit, instead of you cold-messaging a directory.
          </li>
          <li>
            <span className="font-semibold text-slate-800">Referrals</span> —
            ask someone at a company you&apos;re targeting, with visibility that
            opens up gradually so requests don&apos;t sit unseen.
          </li>
          <li>
            <span className="font-semibold text-slate-800">Opportunities</span>{" "}
            — anyone who hears about an opening can share it, and applicants get
            a real conversation instead of a black-box form.
          </li>
        </ul>
      </ContentSection>

      <ContentSection id="who-built-it" title="Who built it">
        <p>
          Cohortly is built by students, for students. We are shipping the tools
          we wished we had when we needed a mentor, a referral, or an honest
          read on an opportunity.
        </p>
      </ContentSection>

      <div className="rounded-xl border border-teal-900/10 bg-white/80 px-5 py-6 sm:px-7">
        <p className="font-[family-name:var(--font-display)] text-lg font-bold tracking-tight text-slate-900 sm:text-xl">
          Join your college on Cohortly
        </p>
        <p className="mt-2 text-sm leading-relaxed text-[var(--muted)] sm:text-[0.95rem]">
          Sign up with your college email, or write to us if you want to bring
          Cohortly to your campus.
        </p>
        <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:items-center">
          <Link
            href="/auth"
            className="inline-flex justify-center rounded-xl bg-[var(--brand)] px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-[var(--brand-dark)]"
          >
            Join with your college email
          </Link>
          <a
            href="mailto:cohortly.in@gmail.com?subject=Bring%20Cohortly%20to%20my%20college"
            className="inline-flex justify-center rounded-xl border border-teal-900/15 bg-white px-5 py-2.5 text-sm font-semibold text-[var(--brand)] transition hover:bg-teal-50"
          >
            Bring Cohortly to your college
          </a>
        </div>
      </div>
    </ContentPage>
  );
}
