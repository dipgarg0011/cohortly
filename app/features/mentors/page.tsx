import type { Metadata } from "next";
import { FeaturePage } from "@/components/feature-page";

export const metadata: Metadata = {
  title: "Mentors · Cohortly",
  description:
    "Ask seniors and graduates at your college for advice — without pressure on either side.",
};

export default function MentorsFeaturePage() {
  return (
    <FeaturePage
      headline="Ask for advice without the awkwardness"
      intro={[
        "Mentorship on Cohortly is built for real campus life: short asks, honest answers, and no expectation that someone must become your permanent mentor.",
        "Students get a clear way to ask. Graduates get control over when they are available — including the ability to pause when life gets busy.",
        "Help stays inside your college, so context travels with the ask instead of starting from zero.",
      ]}
      steps={[
        {
          title: "Write a specific ask",
          body: "Say what you need, what you have tried, and what a useful answer looks like — interview prep, course choice, first job nerves, and more.",
        },
        {
          title: "Reach people who can help",
          body: "Your ask is routed toward members of your college who are open to mentoring in related areas.",
        },
        {
          title: "Get a reply — or a pass",
          body: "Mentors can answer, ask a clarifying question, or decline. Both outcomes are normal and respected.",
        },
        {
          title: "Follow up thoughtfully",
          body: "If a conversation continues, keep it focused. Do not turn one favour into an open-ended demand on someone’s calendar.",
        },
      ]}
      asker={{
        title: "When you need guidance",
        body: "Treat mentors as volunteers. Be clear, be patient, and accept a no without pushing. A good ask respects their time as much as your urgency.",
      }}
      helper={{
        title: "When you are open to mentoring",
        body: "Set what you can offer and pause whenever you need to. A short, honest reply helps more than silence — and you never owe a call or a long thread.",
      }}
    />
  );
}
