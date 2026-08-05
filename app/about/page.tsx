import type { Metadata } from "next";
import Link from "next/link";
import { ContentPage, ContentSection } from "@/components/content-page";

export const metadata: Metadata = {
  title: "About · Cohortly",
  description:
    "What Cohortly is, why it exists, and who built this private network for your college.",
};

export default function AboutPage() {
  return (
    <ContentPage
      title="About Cohortly"
      description="A private college network so students and graduates at your college can find mentors, referrals, and opportunities among people who already share a campus."
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
          mentors for advice, request referrals, and discover opportunities
          posted by alumni and peers.
        </p>
        <p>
          The point is not another public social network. It is a smaller,
          trusted room where asking for help feels normal — and where saying no
          is also normal.
        </p>
      </ContentSection>

      <ContentSection id="for-students" title="For students">
        <p>
          Find seniors and graduates who have been where you are. Ask a clear
          question, request a resume read or referral when someone is open to
          it, and browse opportunities shared by people from your college.
        </p>
        <p>
          You do not need a huge following or a perfect profile — just a college
          email and a specific ask.
        </p>
      </ContentSection>

      <ContentSection id="for-graduates" title="For graduates">
        <p>
          Help when you have capacity. Cohortly is built so you control your
          time: set what you are open to, pause mentorship when life gets busy,
          and respond only to asks that fit.
        </p>
        <p>
          You are never required to take a call, write a referral, or guarantee
          an outcome. A short, honest reply — or a pass — keeps the network
          healthy for the next student.
        </p>
      </ContentSection>

      <ContentSection
        id="college-email-only"
        title="Why college-email-only"
      >
        <p>
          Access is limited to verified college email addresses so the directory
          stays a real campus community — not recruiters, bots, or strangers
          scraping resumes.
        </p>
        <p>
          That constraint is intentional. Trust drops the moment anyone can join.
          College email is a simple gate that keeps Cohortly useful.
        </p>
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
