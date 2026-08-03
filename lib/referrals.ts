export type ReferralStatus = "open" | "accepted" | "closed" | "expired";

export type ReferralProfileSnippet = {
  id: string;
  full_name: string | null;
  batch_year: number | null;
  department: string | null;
  avatar_url: string | null;
};

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
  target_company_normalized: string | null;
  visibility_tier: number;
  opened_to_all_at: string | null;
  context: string | null;
  accepted_at: string | null;
  referred_at: string | null;
  student?: ReferralProfileSnippet | null;
  acceptor?: ReferralProfileSnippet | null;
  question_count?: number;
  view_count?: number;
};

export type ReferralReachStats = {
  tier: number;
  opens_to_all_at: string | null;
  matching_graduate_count: number;
  past_company_graduate_count: number;
};

export const REFERRAL_SELECT = `
  id, student_id, company, role, resume_url, job_link, deadline, status, accepted_by, created_at,
  target_company_normalized, visibility_tier, opened_to_all_at, context, accepted_at, referred_at,
  student:profiles!student_id ( id, full_name, batch_year, department, avatar_url ),
  acceptor:profiles!accepted_by ( id, full_name, batch_year, department, avatar_url )
`;

function asOne<T>(value: T | T[] | null | undefined): T | null {
  if (!value) return null;
  return Array.isArray(value) ? (value[0] ?? null) : value;
}

export function normalizeReferralRequest(
  row: Record<string, unknown>,
): ReferralRequest {
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
    target_company_normalized:
      (row.target_company_normalized as string | null) ?? null,
    visibility_tier: Number(row.visibility_tier ?? 1),
    opened_to_all_at: (row.opened_to_all_at as string | null) ?? null,
    context: (row.context as string | null) ?? null,
    accepted_at: (row.accepted_at as string | null) ?? null,
    referred_at: (row.referred_at as string | null) ?? null,
    student: asOne(
      row.student as ReferralProfileSnippet | ReferralProfileSnippet[] | null,
    ),
    acceptor: asOne(
      row.acceptor as ReferralProfileSnippet | ReferralProfileSnippet[] | null,
    ),
    question_count:
      row.question_count != null ? Number(row.question_count) : undefined,
    view_count: row.view_count != null ? Number(row.view_count) : undefined,
  };
}

export function normalizeReachStats(
  row: Record<string, unknown> | null | undefined,
): ReferralReachStats | null {
  if (!row) return null;
  return {
    tier: Number(row.tier ?? 1),
    opens_to_all_at: (row.opens_to_all_at as string | null) ?? null,
    matching_graduate_count: Number(row.matching_graduate_count ?? 0),
    past_company_graduate_count: Number(row.past_company_graduate_count ?? 0),
  };
}

/** Compute tier from created_at (mirrors SQL referral_age_tier). */
export function referralAgeTier(createdAt: string, now = new Date()): number {
  const created = new Date(createdAt).getTime();
  if (Number.isNaN(created)) return 1;
  const hours = (now.getTime() - created) / (1000 * 60 * 60);
  if (hours < 48) return 1;
  if (hours < 5 * 24) return 2;
  return 3;
}

export function daysUntil(iso: string | null, now = new Date()): number | null {
  if (!iso) return null;
  const target = new Date(iso).getTime();
  if (Number.isNaN(target)) return null;
  return Math.ceil((target - now.getTime()) / (1000 * 60 * 60 * 24));
}

export function reachLabel(
  request: ReferralRequest,
  stats: ReferralReachStats | null,
): string {
  const tier = stats?.tier ?? request.visibility_tier ?? referralAgeTier(request.created_at);
  const company = request.company.trim() || "this company";
  const matchCount = stats?.matching_graduate_count ?? 0;

  if (request.status !== "open") {
    if (request.status === "accepted") return "Accepted — chat is unlocked";
    if (request.status === "expired") return "Expired";
    return "Closed";
  }

  if (tier >= 3) {
    return "Now visible to all graduates";
  }

  const opensAt =
    stats?.opens_to_all_at ??
    (() => {
      const d = new Date(request.created_at);
      d.setDate(d.getDate() + 5);
      return d.toISOString();
    })();
  const days = daysUntil(opensAt);

  if (tier === 1) {
    if (matchCount > 0) {
      return `Visible to ${matchCount} ${matchCount === 1 ? "person" : "people"} at ${company}`;
    }
    return `No one from ${company} yet — opens to all graduates in ${Math.max(days ?? 5, 0)} days`;
  }

  // tier 2
  if (days != null && days > 0) {
    return `Opening to all graduates in ${days} ${days === 1 ? "day" : "days"}`;
  }
  return "Opening to all graduates soon";
}

export function postingExpectation(
  company: string,
  graduateCount: number | null,
): string {
  const name = company.trim() || "that company";
  if (graduateCount == null) return "Checking who’s on Cohortly…";
  if (graduateCount > 0) {
    return `${graduateCount} ${graduateCount === 1 ? "graduate" : "graduates"} at ${name} ${graduateCount === 1 ? "is" : "are"} on Cohortly`;
  }
  return `No one from ${name} yet — your request will open to all graduates in 5 days.`;
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

export function mapReferralError(message: string): string {
  if (message.includes("REFERRAL_OPEN_LIMIT")) {
    return "You can have at most 3 open referral requests at a time.";
  }
  if (message.includes("REFERRAL_COMPANY_LIMIT")) {
    return "You already requested this company in the last 30 days.";
  }
  return message;
}

export function needsReferralFollowup(
  request: ReferralRequest,
  currentUserId: string,
  now = new Date(),
): boolean {
  if (request.accepted_by !== currentUserId) return false;
  if (request.status !== "accepted") return false;
  if (request.referred_at) return false;
  const accepted = request.accepted_at
    ? new Date(request.accepted_at)
    : new Date(request.created_at);
  if (Number.isNaN(accepted.getTime())) return false;
  const weekMs = 7 * 24 * 60 * 60 * 1000;
  return now.getTime() - accepted.getTime() >= weekMs;
}
