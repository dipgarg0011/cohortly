import type { Metadata } from "next";
import { FeaturePage } from "@/components/feature-page";

export const metadata: Metadata = {
  title: "Opportunities · Cohortly",
  description:
    "Discover internships, roles, and leads shared by students and graduates at your college.",
};

export default function OpportunitiesFeaturePage() {
  return (
    <FeaturePage
      headline="Opportunities from people you already share a campus with"
      intro={[
        "The best leads often come from someone a few batches ahead who knows a team is hiring — not from a generic job board. Cohortly lets members of your college post and browse those opportunities in one place.",
        "Listings are shared by peers and alumni. Cohortly does not vet every post, so treat them as starting points: verify the role, the company, and the link before you apply.",
        "When someone from your college posts a role, you get context that a cold board cannot offer — and they get applicants who already share a campus.",
      ]}
      steps={[
        {
          title: "Browse what your college is sharing",
          body: "See internships, full-time roles, and other leads posted by verified members.",
        },
        {
          title: "Read the details carefully",
          body: "Check what the poster knows, what is still uncertain, and whether they are affiliated with the company.",
        },
        {
          title: "Apply or reach out with context",
          body: "Respond through Cohortly when the post allows it, and say why you are a fit instead of sending an empty “interested.”",
        },
        {
          title: "Post only what you can stand behind",
          body: "If you share a role, be honest about what you know — and update or close it when it is no longer open.",
        },
      ]}
      asker={{
        title: "If you are looking for roles",
        body: "Use opportunities as peer leads. Verify employers yourself, and do not share personal documents beyond what the application actually needs.",
      }}
      helper={{
        title: "If you are posting an opportunity",
        body: "Only share listings you can vouch for at a basic level. Label uncertainty clearly. Do not harvest resumes for unrelated purposes.",
      }}
    />
  );
}
