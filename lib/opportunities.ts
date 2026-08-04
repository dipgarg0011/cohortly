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

export type ApplicationStatus =
  | "pending"
  | "accepted"
  | "declined"
  | "withdrawn";

export type OpportunityApplication = {
  id: string;
  opportunity_id: string;
  applicant_id: string;
  pitch: string;
  resume_url: string | null;
  status: ApplicationStatus;
  created_at: string;
  opportunity?: Opportunity | null;
  applicant?: {
    id: string;
    full_name: string | null;
    batch_year: number | null;
    department: string | null;
    skills: string[] | null;
    avatar_url: string | null;
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

export const APPLICATION_STATUS_LABEL: Record<ApplicationStatus, string> = {
  pending: "Pending",
  accepted: "Accepted",
  declined: "Declined",
  withdrawn: "Withdrawn",
};

export const PITCH_MIN = 100;
export const PITCH_MAX = 600;

export const APPLICATION_SELECT = `
  id, opportunity_id, applicant_id, pitch, resume_url, status, created_at
`;

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

export function normalizeApplication(
  row: Record<string, unknown>,
): OpportunityApplication {
  const opportunityRow = asOne(
    row.opportunity as Record<string, unknown> | Record<string, unknown>[] | null,
  );

  return {
    id: row.id as string,
    opportunity_id: row.opportunity_id as string,
    applicant_id: row.applicant_id as string,
    pitch: row.pitch as string,
    resume_url: (row.resume_url as string | null) ?? null,
    status: row.status as ApplicationStatus,
    created_at: row.created_at as string,
    opportunity: opportunityRow ? normalizeOpportunity(opportunityRow) : null,
    applicant: asOne(
      row.applicant as
        | OpportunityApplication["applicant"]
        | NonNullable<OpportunityApplication["applicant"]>[]
        | null,
    ),
  };
}

export function mapApplicationError(message: string): string {
  if (message.includes("APPLICATION_RATE_LIMIT")) {
    return "You can submit at most 5 applications every 7 days.";
  }
  if (message.includes("MESSAGE_NOT_ALLOWED")) {
    return "Couldn't start the application chat. Please try again, or ask an admin if this keeps happening.";
  }
  if (message.includes("expired")) {
    return "This opportunity has expired.";
  }
  if (message.includes("own posting")) {
    return "You can't apply to your own posting.";
  }
  if (message.includes("NOT_ALLOWED")) {
    return "You're not allowed to do that.";
  }
  if (
    message.includes("row-level security") ||
    message.includes("violates row-level security")
  ) {
    return "You're not allowed to apply to this opportunity.";
  }
  if (message.includes("duplicate key") || message.includes("unique")) {
    return "You've already applied to this opportunity.";
  }
  if (message.includes("pitch") || message.includes("check constraint")) {
    return "Your pitch must be between 100 and 600 characters.";
  }
  return message || "Something went wrong. Please try again.";
}
