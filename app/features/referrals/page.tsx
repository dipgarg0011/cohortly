import type { Metadata } from "next";
import { FeaturePage } from "@/components/feature-page";

export const metadata: Metadata = {
  title: "Referrals · Cohortly",
  description:
    "Request referrals from graduates at your college — voluntary, contextual, and respectful of their time.",
};

export default function ReferralsFeaturePage() {
  return (
    <FeaturePage
      headline="Referrals without cold DMs"
      intro={[
        "A referral works best when it comes from someone who shares your college and can vouch for effort, not from a stranger’s inbox. Cohortly gives students a structured way to ask, and graduates a structured way to say yes or no.",
        "Requests include the company or role context and materials you choose to share — so the ask is concrete instead of “can you refer me?” with no detail.",
        "Nobody is required to refer you. The product is designed around voluntary help, not pressure.",
      ]}
      steps={[
        {
          title: "Prepare a clear referral ask",
          body: "Name the company or role, why you are a fit, and attach the resume version you want them to see.",
        },
        {
          title: "Reach graduates who may help",
          body: "Your request is shown to people from your college who are in a position to consider it — for example those connected to the target company when that information is available.",
        },
        {
          title: "They decide",
          body: "A graduate can refer, ask questions, or decline. A no is a valid answer and should end the chase.",
        },
        {
          title: "Continue only if both sides want to",
          body: "If someone engages, keep communication focused on the role and what they need from you — not endless follow-ups.",
        },
      ]}
      asker={{
        title: "If you are requesting a referral",
        body: "Do the homework first. Tailor your materials, explain the fit in a few lines, and remember that their reputation is on the line — not only your application.",
      }}
      helper={{
        title: "If you receive a referral request",
        body: "Help only when you are comfortable. You can pass without explaining your whole calendar. Never feel obliged to forward a resume you would not stand behind.",
      }}
    />
  );
}
