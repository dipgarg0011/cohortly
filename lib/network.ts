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
  "Software Engineering",
  "AI",
  "Cybersecurity",
  "Cloud",
  "DevOps",
  "Blockchain",
  "Quant",
  "Research",
  "Competitive Programming",
  "Robotics",
  "Hardware",
  "Game Dev",
  "Civil Engineering",
  "Mechanical",
  "Electrical",
  "Electronics",
  "Chemical",
  "Metallurgy",
  "Mining",
  "Architecture",
  "Biotech",
  "UX Research",
  "Startups",
  "Investing",
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
  avatar_url: string | null;
};

/**
 * Suggested default for the student/graduate control.
 * Graduation assumed end of June: if batch_year < current year, or
 * batch_year == current year and month is July or later → graduate.
 * Future batch years never suggest graduate.
 */
export function suggestedProfileStatus(
  batchYear: number | null,
  now = new Date(),
): ProfileStatus {
  if (hasBatchYearPassed(batchYear, now)) return "graduate";
  return "student";
}

/**
 * True when batch year has passed the June graduation cutoff (July onward
 * of that year). Future years, null, and invalid values never pass.
 */
export function hasBatchYearPassed(
  batchYear: number | null,
  now = new Date(),
): boolean {
  if (batchYear == null) return false;
  const y = Math.trunc(Number(batchYear));
  if (!Number.isFinite(y) || y < 1900 || y > 2100) return false;

  const year = now.getFullYear();
  const month = now.getMonth() + 1; // 1–12

  if (y > year) return false;
  if (y === year && month < 7) return false;
  if (y < year) return true;
  // y === year && month >= 7
  return true;
}

/** Badge / role label from explicit profiles.status. */
export function getProfileRole(
  status: ProfileStatus | null | undefined,
): ProfileRole {
  // Only an explicit "graduate" row is a Graduate. null/legacy → Student.
  return status === "graduate" ? "Graduate" : "Student";
}

/**
 * Quiet cohort meta — matches mobile: `MET · 2028`
 * (department · full batch year).
 */
export function formatCohortLockup(
  batchYear: number | null | undefined,
  department: string | null | undefined,
): string | null {
  const year =
    batchYear != null && Number.isFinite(batchYear)
      ? String(batchYear)
      : null;
  const dept = department?.trim() || null;
  if (dept && year) return `${dept} · ${year}`;
  if (dept) return dept;
  if (year) return year;
  return null;
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
