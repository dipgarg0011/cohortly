export type ProfileRole = "Student" | "Graduate";

/** Stored on profiles.status — explicit, not inferred from year alone. */
export type ProfileStatus = "student" | "graduate";

export const OPEN_TO_OPTIONS = [
  "Mentoring",
  "Referrals",
  "Hiring",
  "Internships",
  "Networking",
] as const;

export type OpenToTag = (typeof OPEN_TO_OPTIONS)[number];

export const SKILL_OPTIONS = [
  "Web Development",
  "Product Management",
  "Finance",
  "Data Science",
  "Design",
  "Marketing",
  "Consulting",
  "Entrepreneurship",
  "Machine Learning",
  "Mobile Development",
] as const;

export type SkillTag = (typeof SKILL_OPTIONS)[number];

export type NetworkProfile = {
  id: string;
  full_name: string | null;
  batch_year: number | null;
  /** Explicit student / graduate — prefer this over guessing from batch_year */
  status: ProfileStatus | null;
  department: string | null;
  current_job: string | null;
  company: string | null;
  role_title: string | null;
  is_founder: boolean | null;
  open_to: string[] | null;
  skills: string[] | null;
  linkedin_url: string | null;
  avatar_url: string | null;
  bio: string | null;
};

export type EditableProfile = {
  full_name: string;
  batch_year: number | null;
  status: ProfileStatus;
  department: string;
  company: string;
  past_companies: string[];
  role_title: string;
  is_founder: boolean;
  open_to: string[];
  skills: string[];
  linkedin_url: string;
  bio: string;
};

/**
 * Suggested default for the student/graduate control.
 * Graduation assumed end of June: if batch_year < current year, or
 * batch_year == current year and month is July or later → graduate.
 */
export function suggestedProfileStatus(
  batchYear: number | null,
  now = new Date(),
): ProfileStatus {
  // Unknown batch → student (never grant graduate powers by default).
  if (batchYear == null) return "student";
  const year = now.getFullYear();
  const month = now.getMonth() + 1; // 1–12
  if (batchYear < year) return "graduate";
  if (batchYear === year && month >= 7) return "graduate";
  return "student";
}

/** True when batch year has passed the June graduation cutoff. */
export function hasBatchYearPassed(
  batchYear: number | null,
  now = new Date(),
): boolean {
  return suggestedProfileStatus(batchYear, now) === "graduate";
}

/** Badge / role label from explicit profiles.status. */
export function getProfileRole(
  status: ProfileStatus | null | undefined,
): ProfileRole {
  // Only an explicit "graduate" row is a Graduate. null/legacy → Student.
  return status === "graduate" ? "Graduate" : "Student";
}

export function isGraduateStatus(
  status: ProfileStatus | null | undefined,
): boolean {
  return status === "graduate";
}

export function getInitials(name: string | null): string {
  if (!name?.trim()) return "?";
  const parts = name.trim().split(/\s+/).slice(0, 2);
  return parts.map((p) => p[0]?.toUpperCase() ?? "").join("");
}

export function firstName(fullName: string | null | undefined): string {
  const trimmed = fullName?.trim();
  if (!trimmed) return "there";
  return trimmed.split(/\s+/)[0] ?? "there";
}
