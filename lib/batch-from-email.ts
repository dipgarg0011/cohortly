import type { ProfileStatus } from "@/lib/network";

/** Plausible IIT BHU join years inferred from email local-part YY. */
const JOIN_YEAR_MIN = 2015;
const JOIN_YEAR_MAX = 2035;

export type PassoutWindow = {
  /** Earliest typical passout (BTech): join + 4 */
  min: number;
  /** Typical IDD passout: join + 5 */
  typicalMax: number;
  /** Soft max allowing one year of slippage: join + 6 */
  max: number;
};

/**
 * Parse joining year from college email local-part patterns like:
 * `met23`, `name.met23`, `met23.name` → 2023.
 * Uses the last letter-prefixed 2-digit YY in a plausible 2015–2035 range.
 * Returns null when the email has no confident batch pattern (test / staff accounts).
 */
export function parseJoinYearFromEmail(
  email: string | null | undefined,
): number | null {
  if (!email) return null;
  const normalized = email.trim().toLowerCase();
  const at = normalized.lastIndexOf("@");
  if (at <= 0) return null;

  const local = normalized.slice(0, at);
  if (!local) return null;

  // Match a letter immediately before exactly two digits (not part of a longer number).
  // Examples: met23, cse22, name.met23, met23.name
  const matches = [...local.matchAll(/[a-z](\d{2})(?!\d)/g)];
  if (matches.length === 0) return null;

  const candidates: number[] = [];
  for (const match of matches) {
    const yy = Number(match[1]);
    if (!Number.isInteger(yy)) continue;
    const year = 2000 + yy;
    if (year >= JOIN_YEAR_MIN && year <= JOIN_YEAR_MAX) {
      candidates.push(year);
    }
  }

  if (candidates.length === 0) return null;
  return candidates[candidates.length - 1] ?? null;
}

/** Expected passout window from a confidently parsed join year. */
export function expectedPassoutWindow(joinYear: number): PassoutWindow {
  return {
    min: joinYear + 4,
    typicalMax: joinYear + 5,
    max: joinYear + 6,
  };
}

/** Short UI hint when join year was parsed from email. */
export function joinYearPassoutHint(joinYear: number): string {
  const { min, typicalMax } = expectedPassoutWindow(joinYear);
  return `From your email: joined ${joinYear} → expected passout ${min}–${typicalMax}.`;
}

/**
 * True when calendar year is still before the earliest possible graduation
 * (join + 4), so the user must remain a student.
 */
export function mustBeStudentFromJoinYear(
  joinYear: number,
  now = new Date(),
): boolean {
  return now.getFullYear() < joinYear + 4;
}

export function assertStatusAllowed(
  status: ProfileStatus,
  joinYear: number | null,
  now = new Date(),
): { ok: true } | { ok: false; error: string } {
  if (joinYear == null) return { ok: true };
  if (status !== "graduate") return { ok: true };
  if (!mustBeStudentFromJoinYear(joinYear, now)) return { ok: true };

  const { min, typicalMax } = expectedPassoutWindow(joinYear);
  return {
    ok: false,
    error: `Your email suggests joining ${joinYear}; graduation is typically ${min}–${typicalMax}. You can't register as a graduate yet.`,
  };
}

export function assertBatchYearAllowed(
  batchYear: number,
  joinYear: number | null,
): { ok: true } | { ok: false; error: string } {
  if (joinYear == null) return { ok: true };

  const { min, typicalMax, max } = expectedPassoutWindow(joinYear);
  if (batchYear >= min && batchYear <= max) return { ok: true };

  return {
    ok: false,
    error: `Your email suggests joining ${joinYear}; passout year should be ${min}–${typicalMax} (up to ${max} if delayed).`,
  };
}

/** Validate status + batch year together when join year is known. */
export function assertAffiliationFromEmail(
  email: string | null | undefined,
  status: ProfileStatus,
  batchYear: number,
  now = new Date(),
): { ok: true; joinYear: number | null } | { ok: false; error: string } {
  const joinYear = parseJoinYearFromEmail(email);
  const statusCheck = assertStatusAllowed(status, joinYear, now);
  if (!statusCheck.ok) return statusCheck;
  const yearCheck = assertBatchYearAllowed(batchYear, joinYear);
  if (!yearCheck.ok) return yearCheck;
  return { ok: true, joinYear };
}
