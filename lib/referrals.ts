export type ReferralStatus = "open" | "accepted" | "closed";

export type ReferralRequest = {
  id: string;
  student_id: string;
  company: string;
  role: string;
  resume_url: string | null;
  job_link: string | null;
  deadline: string | null;
  status: ReferralStatus;
  accepted_by: string | null;
  created_at: string;
  student?: {
    id: string;
    full_name: string | null;
    batch_year: number | null;
    avatar_url: string | null;
  } | null;
  acceptor?: {
    id: string;
    full_name: string | null;
    batch_year: number | null;
    avatar_url: string | null;
  } | null;
};

type ProfileSnippet = NonNullable<ReferralRequest["student"]>;

function asOne<T>(value: T | T[] | null | undefined): T | null {
  if (!value) return null;
  return Array.isArray(value) ? (value[0] ?? null) : value;
}

export function normalizeReferralRequest(row: Record<string, unknown>): ReferralRequest {
  return {
    id: row.id as string,
    student_id: row.student_id as string,
    company: row.company as string,
    role: row.role as string,
    resume_url: (row.resume_url as string | null) ?? null,
    job_link: (row.job_link as string | null) ?? null,
    deadline: (row.deadline as string | null) ?? null,
    status: row.status as ReferralStatus,
    accepted_by: (row.accepted_by as string | null) ?? null,
    created_at: row.created_at as string,
    student: asOne(row.student as ProfileSnippet | ProfileSnippet[] | null),
    acceptor: asOne(row.acceptor as ProfileSnippet | ProfileSnippet[] | null),
  };
}

export function deadlineLabel(deadline: string | null): string | null {
  if (!deadline) return null;

  const end = new Date(`${deadline}T23:59:59`);
  if (Number.isNaN(end.getTime())) return null;

  const now = new Date();
  const startOfToday = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate(),
  );
  const startOfDeadline = new Date(
    end.getFullYear(),
    end.getMonth(),
    end.getDate(),
  );
  const diffDays = Math.round(
    (startOfDeadline.getTime() - startOfToday.getTime()) / (1000 * 60 * 60 * 24),
  );

  if (diffDays < 0) {
    const overdue = Math.abs(diffDays);
    return overdue === 1 ? "1 day overdue" : `${overdue} days overdue`;
  }
  if (diffDays === 0) return "Due today";
  if (diffDays === 1) return "1 day left";
  return `${diffDays} days left`;
}

export function isDeadlineUrgent(deadline: string | null): boolean {
  if (!deadline) return false;
  const end = new Date(`${deadline}T23:59:59`);
  const now = new Date();
  const diffMs = end.getTime() - now.getTime();
  const diffDays = diffMs / (1000 * 60 * 60 * 24);
  return diffDays <= 3;
}
