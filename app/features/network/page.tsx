import type { Metadata } from "next";
import { FeaturePage } from "@/components/feature-page";

export const metadata: Metadata = {
  title: "Network · Cohortly",
  description:
    "Browse verified students and graduates from your college in one private directory.",
};

export default function NetworkFeaturePage() {
  return (
    <FeaturePage
      headline="Your college network, in one place"
      intro={[
        "Cohortly’s network is a private directory of students and graduates from your college — not a public social feed. You can find people by batch, branch, role, and what they are open to helping with.",
        "Instead of guessing who might reply on LinkedIn, you start from a shared campus. That makes a first message feel like asking a senior you almost know, not cold outreach to a stranger.",
        "Access stays limited to verified college emails so the directory remains useful and trusted.",
      ]}
      steps={[
        {
          title: "Join with your college email",
          body: "Sign up and complete a short profile so people can tell who you are and how to help.",
        },
        {
          title: "Browse people from your college",
          body: "Filter by batch, branch, company, or role to find seniors, classmates, and graduates.",
        },
        {
          title: "Open a conversation with context",
          body: "Reach out when you have a clear reason — advice, a path question, or a warm intro — rather than a generic connect request.",
        },
        {
          title: "Keep the network healthy",
          body: "Update your profile as you grow, and respect when someone is busy or not the right fit.",
        },
      ]}
      asker={{
        title: "If you are looking for people",
        body: "Search with intent. Know what you want to learn, who might have that experience, and what a good reply would look like. Specificity gets answers.",
      }}
      helper={{
        title: "If you are findable in the directory",
        body: "You control how you show up. Keep your profile accurate, ignore asks that do not fit, and help when you have a spare minute — not out of obligation.",
      }}
    />
  );
}
