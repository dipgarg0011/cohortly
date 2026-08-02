export const OPPORTUNITY_TYPES = [
  "Internship",
  "Job",
  "Research",
  "Freelance",
  "Campus Ambassador",
] as const;

export type OpportunityType = (typeof OPPORTUNITY_TYPES)[number];

export type Opportunity = {
  id: string;
  posted_by: string;
  type: OpportunityType;
  title: string;
  company: string | null;
  description: string | null;
  apply_link: string | null;
  location: string | null;
  deadline: string | null;
  created_at: string;
  poster?: {
    id: string;
    full_name: string | null;
    batch_year: number | null;
  } | null;
};

export const TYPE_FILTERS = [
  { id: "all", label: "All" },
  { id: "Internship", label: "Internships" },
  { id: "Job", label: "Jobs" },
  { id: "Research", label: "Research" },
  { id: "Freelance", label: "Freelance" },
  { id: "Campus Ambassador", label: "Campus Ambassador" },
] as const;

export type OpportunityFilter = (typeof TYPE_FILTERS)[number]["id"];

function asOne<T>(value: T | T[] | null | undefined): T | null {
  if (!value) return null;
  return Array.isArray(value) ? (value[0] ?? null) : value;
}

export function normalizeOpportunity(row: Record<string, unknown>): Opportunity {
  return {
    id: row.id as string,
    posted_by: row.posted_by as string,
    type: row.type as OpportunityType,
    title: row.title as string,
    company: (row.company as string | null) ?? null,
    description: (row.description as string | null) ?? null,
    apply_link: (row.apply_link as string | null) ?? null,
    location: (row.location as string | null) ?? null,
    deadline: (row.deadline as string | null) ?? null,
    created_at: row.created_at as string,
    poster: asOne(
      row.poster as
        | Opportunity["poster"]
        | NonNullable<Opportunity["poster"]>[]
        | null,
    ),
  };
}
