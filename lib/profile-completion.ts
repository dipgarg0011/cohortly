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

/** High-signal copy for graduates missing `profiles.company`. */
export const GRADUATE_COMPANY_TIP =
  "Add your company so students looking for referrals can find you.";

export function isGraduateMissingCompany(
  profile: Pick<ProfileCompletionFields, "status" | "company"> | null | undefined,
): boolean {
  if (!profile) return false;
  return profile.status === "graduate" && !profile.company?.trim();
}

const COMPLETION_CHECKS: {
  key: keyof ProfileCompletionFields;
  label: string;
  tip: string;
  isFilled: (profile: ProfileCompletionFields) => boolean;
  /** When set, tip is only offered if this returns true. Still counts toward %. */
  tipWhen?: (profile: ProfileCompletionFields) => boolean;
}[] = [
  {
    key: "full_name",
    label: "full name",
    tip: "Add your full name",
    isFilled: (p) => Boolean(p.full_name?.trim()),
  },
  {
    key: "batch_year",
    label: "batch year",
    tip: "Add your batch year",
    isFilled: (p) => p.batch_year != null,
  },
  {
    key: "status",
    label: "student or graduate status",
    tip: "Say whether you're a student or graduate",
    isFilled: (p) => p.status === "student" || p.status === "graduate",
  },
  {
    key: "department",
    label: "department",
    tip: "Add your department",
    isFilled: (p) => Boolean(p.department?.trim()),
  },
  {
    key: "current_job",
    label: "role title",
    tip: "Add your role title",
    isFilled: (p) => Boolean(p.current_job?.trim() || p.role_title?.trim()),
  },
  {
    key: "company",
    label: "company",
    tip: GRADUATE_COMPANY_TIP,
    isFilled: (p) => Boolean(p.company?.trim()),
    // Students often have no workplace yet — only nudge graduates (referrals).
    tipWhen: (p) => p.status === "graduate",
  },
  {
    key: "bio",
    label: "bio",
    tip: "Add a short bio so people know how to approach you",
    isFilled: (p) => Boolean(p.bio?.trim()),
  },
  {
    key: "linkedin_url",
    label: "LinkedIn",
    tip: "Add your LinkedIn so connections can verify you",
    isFilled: (p) => Boolean(p.linkedin_url?.trim()),
  },
  {
    key: "avatar_url",
    label: "photo",
    tip: "Add a profile photo",
    isFilled: (p) => Boolean(p.avatar_url?.trim()),
  },
  {
    key: "skills",
    label: "skills",
    tip: "Add skills so the right mentorship asks reach you",
    isFilled: (p) => (p.skills?.length ?? 0) > 0,
  },
  {
    key: "open_to",
    label: "open to",
    tip: "Share what you're open to",
    isFilled: (p) => (p.open_to?.length ?? 0) > 0,
  },
];

/** Missing fields that unlock the most value — tip order, not % order. */
const UNLOCK_TIP_ORDER: (keyof ProfileCompletionFields)[] = [
  "company",
  "skills",
  "current_job",
  "bio",
  "linkedin_url",
  "avatar_url",
];

function isTipEligible(
  check: (typeof COMPLETION_CHECKS)[number],
  profile: ProfileCompletionFields,
): boolean {
  if (check.isFilled(profile)) return false;
  if (check.tipWhen && !check.tipWhen(profile)) return false;
  return true;
}

export function getProfileCompletion(profile: ProfileCompletionFields) {
  const total = COMPLETION_CHECKS.length;
  const filled = COMPLETION_CHECKS.filter((check) =>
    check.isFilled(profile),
  ).length;
  const percent = Math.round((filled / total) * 100);

  const byKey = new Map(COMPLETION_CHECKS.map((c) => [c.key, c]));
  let next =
    UNLOCK_TIP_ORDER.map((key) => byKey.get(key)).find(
      (check) => check && isTipEligible(check, profile),
    ) ?? null;

  if (!next) {
    next =
      COMPLETION_CHECKS.find((check) => isTipEligible(check, profile)) ?? null;
  }

  return {
    percent,
    filled,
    total,
    nextTip: next?.tip ?? null,
    nextTipKey: next?.key ?? null,
    message:
      percent >= 100
        ? "Your profile is complete."
        : `Your profile is ${percent}% complete — ${next?.tip ?? "finish a few more details"}`,
  };
}
