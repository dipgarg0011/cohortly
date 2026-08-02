export type ProfileRole = "Student" | "Graduate";

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
  department: string;
  company: string;
  role_title: string;
  is_founder: boolean;
  open_to: string[];
  skills: string[];
  linkedin_url: string;
  bio: string;
};

export function getProfileRole(
  batchYear: number | null,
  currentYear = new Date().getFullYear(),
): ProfileRole {
  if (batchYear == null) return "Graduate";
  return batchYear >= currentYear ? "Student" : "Graduate";
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
