export type ProfileCompletionFields = {
  full_name: string | null;
  batch_year: number | null;
  status?: string | null;
  department: string | null;
  current_job: string | null;
  role_title?: string | null;
  company: string | null;
  bio: string | null;
  linkedin_url: string | null;
  avatar_url: string | null;
  skills: string[] | null;
  open_to: string[] | null;
};

const COMPLETION_CHECKS: {
  key: keyof ProfileCompletionFields;
  label: string;
  tip: string;
  isFilled: (profile: ProfileCompletionFields) => boolean;
}[] = [
  {
    key: "full_name",
    label: "full name",
    tip: "add your full name",
    isFilled: (p) => Boolean(p.full_name?.trim()),
  },
  {
    key: "batch_year",
    label: "batch year",
    tip: "add your batch year",
    isFilled: (p) => p.batch_year != null,
  },
  {
    key: "status",
    label: "student or graduate status",
    tip: "say whether you're a student or graduate",
    isFilled: (p) => p.status === "student" || p.status === "graduate",
  },
  {
    key: "department",
    label: "department",
    tip: "add your department",
    isFilled: (p) => Boolean(p.department?.trim()),
  },
  {
    key: "current_job",
    label: "role title",
    tip: "add your role title",
    isFilled: (p) =>
      Boolean(p.current_job?.trim() || p.role_title?.trim()),
  },
  {
    key: "company",
    label: "company",
    tip: "add your company",
    isFilled: (p) => Boolean(p.company?.trim()),
  },
  {
    key: "bio",
    label: "bio",
    tip: "add a bio to help others find you",
    isFilled: (p) => Boolean(p.bio?.trim()),
  },
  {
    key: "linkedin_url",
    label: "LinkedIn",
    tip: "add your LinkedIn URL",
    isFilled: (p) => Boolean(p.linkedin_url?.trim()),
  },
  {
    key: "avatar_url",
    label: "photo",
    tip: "add a profile photo",
    isFilled: (p) => Boolean(p.avatar_url?.trim()),
  },
  {
    key: "skills",
    label: "skills",
    tip: "add skills or interests",
    isFilled: (p) => (p.skills?.length ?? 0) > 0,
  },
  {
    key: "open_to",
    label: "open to",
    tip: "share what you're open to",
    isFilled: (p) => (p.open_to?.length ?? 0) > 0,
  },
];

export function getProfileCompletion(profile: ProfileCompletionFields) {
  const total = COMPLETION_CHECKS.length;
  const filled = COMPLETION_CHECKS.filter((check) =>
    check.isFilled(profile),
  ).length;
  const percent = Math.round((filled / total) * 100);
  const next = COMPLETION_CHECKS.find((check) => !check.isFilled(profile));

  return {
    percent,
    filled,
    total,
    nextTip: next?.tip ?? null,
    message:
      percent >= 100
        ? "Your profile is complete."
        : `Your profile is ${percent}% complete — ${next?.tip ?? "finish a few more details"}`,
  };
}
