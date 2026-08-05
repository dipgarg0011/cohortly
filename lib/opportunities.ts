import type { ProfileStatus } from "@/lib/network";

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
  contact_info: string | null;
  location: string | null;
  deadline: string | null;
  created_at: string;
  poster?: {
    id: string;
    full_name: string | null;
    batch_year: number | null;
    status?: ProfileStatus | null;
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
export const DESCRIPTION_MIN = 100;
export const ACTIVE_POSTING_CAP = 5;

export const OPPORTUNITY_SELECT = `
  id, posted_by, type, title, company, description, apply_link, contact_info, location, deadline, created_at,
  poster:profiles!posted_by ( id, full_name, batch_year, status )
`;

export const APPLICATION_SELECT = `
  id, opportunity_id, applicant_id, pitch, resume_url, status, created_at
`;

function asOne<T>(value: T | T[] | null | undefined): T | null {
  if (!value) return null;
  return Array.isArray(value) ? (value[0] ?? null) : value;
}

export function isOpportunityActive(deadline: string | null | undefined): boolean {
  if (!deadline) return true;
  const day = deadline.slice(0, 10);
  const today = new Date();
  const yyyy = today.getFullYear();
  const mm = String(today.getMonth() + 1).padStart(2, "0");
  const dd = String(today.getDate()).padStart(2, "0");
  return day >= `${yyyy}-${mm}-${dd}`;
}

/** Soonest deadline first (nulls last), then most recently created. */
export function sortOpportunities(items: Opportunity[]): Opportunity[] {
  return [...items].sort((a, b) => {
    const aDead = a.deadline?.slice(0, 10) ?? null;
    const bDead = b.deadline?.slice(0, 10) ?? null;
    if (aDead && bDead && aDead !== bDead) return aDead.localeCompare(bDead);
    if (aDead && !bDead) return -1;
    if (!aDead && bDead) return 1;
    return b.created_at.localeCompare(a.created_at);
  });
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
    contact_info: (row.contact_info as string | null) ?? null,
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

export function mapOpportunityPostError(message: string): string {
  if (message.includes("OPPORTUNITY_ACTIVE_CAP")) {
    return `You can have at most ${ACTIVE_POSTING_CAP} active postings at a time. Delete or wait for a deadline to pass.`;
  }
  if (message.includes("OPPORTUNITY_DESCRIPTION_TOO_SHORT")) {
    return `Description must be at least ${DESCRIPTION_MIN} characters.`;
  }
  if (message.includes("OPPORTUNITY_CONTACT_REQUIRED")) {
    return "Add an apply link or a contact method (email, phone, or LinkedIn).";
  }
  if (message.includes("OPPORTUNITY_TITLE_REQUIRED")) {
    return "Title is required.";
  }
  if (message.includes("OPPORTUNITY_TYPE_REQUIRED")) {
    return "Type is required.";
  }
  if (
    message.includes("row-level security") ||
    message.includes("violates row-level security")
  ) {
    return "Couldn't post — you may have hit the active posting limit.";
  }
  return message || "Something went wrong. Please try again.";
}

export function mapApplicationError(message: string): string {
  if (message.includes("APPLICATION_RATE_LIMIT")) {
    return "You can submit at most 5 applications every 7 days.";
  }
  if (message.includes("APPLICATION_ALREADY_DECIDED")) {
    return "This application was already decided.";
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
    return "Couldn't start the application chat. Please try again, or ask an admin if this keeps happening.";
  }
  if (message.includes("duplicate key") || message.includes("unique")) {
    return "You've already applied to this opportunity.";
  }
  if (message.includes("pitch") || message.includes("check constraint")) {
    return "Your pitch must be between 100 and 600 characters.";
  }
  return message || "Something went wrong. Please try again.";
}
