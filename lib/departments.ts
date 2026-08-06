/**
 * Canonical IIT (BHU) undergraduate department short codes.
 * Source of truth in DB: public.departments (Phase 1 migration).
 * FALLBACK_DEPARTMENTS mirrors the seed so UI works before/without the table.
 */

export type Department = {
  short_code: string;
  name: string;
};

/** Hardcoded copy of the Phase 1 seed — use when anon or table empty/unavailable. */
export const FALLBACK_DEPARTMENTS: readonly Department[] = [
  { short_code: "APD", name: "Architecture, Planning and Design" },
  { short_code: "BCE", name: "Biochemical Engineering" },
  { short_code: "BME", name: "Biomedical Engineering" },
  { short_code: "CER", name: "Ceramic Engineering" },
  { short_code: "CHE", name: "Chemical Engineering and Technology" },
  { short_code: "CIV", name: "Civil Engineering" },
  { short_code: "CSE", name: "Computer Science and Engineering" },
  { short_code: "ECE", name: "Electronics Engineering" },
  { short_code: "EEE", name: "Electrical Engineering" },
  { short_code: "MEC", name: "Mechanical Engineering" },
  { short_code: "MET", name: "Metallurgical Engineering" },
  { short_code: "MIN", name: "Mining Engineering" },
  { short_code: "MST", name: "Materials Science and Technology" },
  { short_code: "PHE", name: "Pharmaceutical Engineering and Technology" },
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
