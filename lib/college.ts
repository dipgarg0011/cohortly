/** Allowed college email domain for Cohortly (IIT BHU only). */
export const COLLEGE_EMAIL_DOMAIN = "itbhu.ac.in";

export function getCollegeEmailDomain(): string {
  const fromEnv = process.env.NEXT_PUBLIC_COLLEGE_EMAIL_DOMAIN?.trim().toLowerCase();
  if (fromEnv) {
    return fromEnv.replace(/^@/, "");
  }
  return COLLEGE_EMAIL_DOMAIN;
}

/** Normalize for comparisons and blocked_emails lookups. */
export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

/** True only when the address is exactly *@itbhu.ac.in (or the configured domain). */
export function isCollegeEmail(email: string | null | undefined): boolean {
  if (!email) return false;
  const normalized = normalizeEmail(email);
  const at = normalized.lastIndexOf("@");
  if (at <= 0 || at === normalized.length - 1) return false;

  const local = normalized.slice(0, at);
  const domain = normalized.slice(at + 1);
  if (!local || domain.includes("@")) return false;

  return domain === getCollegeEmailDomain();
}

export const COLLEGE_EMAIL_ERROR =
  "Only @itbhu.ac.in college email addresses are allowed";

export const BLOCKED_EMAIL_ERROR =
  "This email address is not allowed to use Cohortly.";
