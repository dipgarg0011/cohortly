/**
 * Canonical IIT (BHU) undergraduate department short codes.
 * Source of truth in DB: public.departments (Phase 1 migration + additive seeds).
 * FALLBACK_DEPARTMENTS mirrors the seed so UI works before/without the table.
 */

export type Department = {
  short_code: string;
  name: string;
};

/** Select sentinel — never persist to profiles.department. */
export const DEPARTMENT_NOT_LISTED_VALUE = "__not_listed__";

/** Max length for custom (not-listed) department strings stored on profiles. */
export const DEPARTMENT_CUSTOM_MAX_LENGTH = 80;

/** Hardcoded copy of the seed — use when anon or table empty/unavailable. */
export const FALLBACK_DEPARTMENTS: readonly Department[] = [
  { short_code: "APD", name: "Architecture, Planning and Design" },
  { short_code: "BCE", name: "Biochemical Engineering" },
  { short_code: "BME", name: "Biomedical Engineering" },
  { short_code: "CER", name: "Ceramic Engineering" },
  { short_code: "CHE", name: "Chemical Engineering and Technology" },
  { short_code: "CHY", name: "Chemistry" },
  { short_code: "CIV", name: "Civil Engineering" },
  { short_code: "CSE", name: "Computer Science and Engineering" },
  { short_code: "DSE", name: "Decision Science and Engineering" },
  { short_code: "ECE", name: "Electronics Engineering" },
  { short_code: "EEE", name: "Electrical Engineering" },
  { short_code: "HSS", name: "Humanistic Studies" },
  {
    short_code: "MAT",
    name: "Mathematical Sciences (Mathematics and Computing)",
  },
  { short_code: "MEC", name: "Mechanical Engineering" },
  { short_code: "MET", name: "Metallurgical Engineering" },
  { short_code: "MIN", name: "Mining Engineering" },
  { short_code: "MST", name: "Materials Science and Technology" },
  { short_code: "PHE", name: "Pharmaceutical Engineering and Technology" },
  { short_code: "PHY", name: "Physics" },
] as const;

export const DEPARTMENT_NOT_LISTED_HREF =
  "mailto:cohortly.in@gmail.com?subject=Department%20not%20listed";

/** e.g. "CSE — Computer Science and Engineering" */
export function formatDepartmentLabel(dept: Department): string {
  return `${dept.short_code} — ${dept.name}`;
}

/** Resolve a stored short_code to a display label; falls back to the raw code. */
export function formatDepartmentDisplay(
  shortCode: string | null | undefined,
  departments: readonly Department[] = FALLBACK_DEPARTMENTS,
): string {
  const code = shortCode?.trim();
  if (!code) return "";
  const match = departments.find((d) => d.short_code === code);
  return match ? formatDepartmentLabel(match) : code;
}

export function isCanonicalShortCode(
  code: string | null | undefined,
  departments: readonly Department[] = FALLBACK_DEPARTMENTS,
): boolean {
  const trimmed = code?.trim();
  if (!trimmed) return false;
  return departments.some((d) => d.short_code === trimmed);
}

/** Trim + collapse internal whitespace. */
export function normalizeDepartmentValue(raw: string): string {
  return raw.trim().replace(/\s+/g, " ");
}

/**
 * Valid profile department: canonical short_code, or non-empty custom text
 * (via explicit "not listed" path). Rejects the UI sentinel.
 */
export function isValidDepartmentValue(
  code: string | null | undefined,
  options?: {
    allowEmpty?: boolean;
    departments?: readonly Department[];
  },
): boolean {
  const allowEmpty = options?.allowEmpty ?? false;
  const departments = options?.departments ?? FALLBACK_DEPARTMENTS;
  const trimmed = code?.trim() ?? "";
  if (!trimmed) return allowEmpty;
  if (trimmed === DEPARTMENT_NOT_LISTED_VALUE) return false;
  if (trimmed.length > DEPARTMENT_CUSTOM_MAX_LENGTH) return false;
  if (isCanonicalShortCode(trimmed, departments)) return true;
  // Custom free-text (not listed)
  return true;
}

type DepartmentsQueryClient = {
  from: (table: string) => {
    select: (columns: string) => {
      order: (
        column: string,
        options?: { ascending?: boolean },
      ) => PromiseLike<{
        data: { short_code: string; name: string }[] | null;
        error: { message: string } | null;
      }>;
    };
  };
};

/**
 * Read departments ordered by short_code.
 * On empty result or error, returns a copy of FALLBACK_DEPARTMENTS.
 * Requires authenticated session (RLS); anon callers should use FALLBACK directly.
 */
export async function fetchDepartments(
  supabase: DepartmentsQueryClient,
): Promise<Department[]> {
  try {
    const { data, error } = await supabase
      .from("departments")
      .select("short_code, name")
      .order("short_code", { ascending: true });

    if (error || !data?.length) {
      return [...FALLBACK_DEPARTMENTS];
    }

    return data.map((row) => ({
      short_code: row.short_code,
      name: row.name,
    }));
  } catch {
    return [...FALLBACK_DEPARTMENTS];
  }
}
