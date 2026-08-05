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
  age_tier?: number;
  open_to_all_now?: boolean;
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
    age_tier:
      row.age_tier != null ? Number(row.age_tier) : undefined,
    open_to_all_now:
      row.open_to_all_now != null ? Boolean(row.open_to_all_now) : undefined,
  };
}

/** Normalize company the same way SQL does (letters+digits only, lower). */
export function normalizeCompanyName(company: string | null | undefined): string {
  return (company ?? "").toLowerCase().replace(/[^a-z0-9]+/g, "");
}

/** Compute age-only tier from created_at (mirrors SQL referral_age_tier). */
export function referralAgeTier(createdAt: string, now = new Date()): number {
  const created = new Date(createdAt).getTime();
  if (Number.isNaN(created)) return 1;
  const hours = (now.getTime() - created) / (1000 * 60 * 60);
  if (hours < 48) return 1;
  if (hours < 5 * 24) return 2;
  return 3;
}

/** Effective visibility tier for UI — age only (matches SQL referral_age_tier). */
export function referralEffectiveTier(
  createdAt: string,
  _matchingGraduateCount?: number | null,
  now = new Date(),
): number {
  return referralAgeTier(createdAt, now);
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
  const matchCount = stats?.matching_graduate_count ?? 0;
  const tier =
    stats?.tier ??
    referralEffectiveTier(request.created_at, matchCount);
  const company = request.company.trim() || "this company";
  const ageTier = stats?.age_tier ?? referralAgeTier(request.created_at);

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
  const daysToAll = daysUntil(opensAt);
  const hoursLeft48 = (() => {
    const created = new Date(request.created_at).getTime();
    const openPast = created + 48 * 60 * 60 * 1000;
    return Math.max(0, Math.ceil((openPast - Date.now()) / (1000 * 60 * 60)));
  })();

  if (ageTier === 1) {
    const companyLine =
      matchCount > 0
        ? `Visible to ${matchCount} ${matchCount === 1 ? "person" : "people"} at ${company}`
        : `Looking for graduates at ${company}`;
    if (hoursLeft48 > 0 && hoursLeft48 < 48) {
      return `${companyLine} · past coworkers in ~${hoursLeft48}h · everyone in ${Math.max(daysToAll ?? 5, 0)}d`;
    }
    return `${companyLine} · opens wider after 48 hours`;
  }

  // age tier 2
  if (daysToAll != null && daysToAll > 0) {
    return `Visible to ${company} + past coworkers · all graduates in ${daysToAll} ${daysToAll === 1 ? "day" : "days"}`;
  }
  return `Visible to ${company} + past coworkers · opening to all graduates soon`;
}

export function postingExpectation(
  company: string,
  graduateCount: number | null,
): string {
  const name = company.trim() || "that company";
  if (graduateCount == null) return "Checking who’s on Cohortly…";
  if (graduateCount > 0) {
    return `${graduateCount} ${graduateCount === 1 ? "graduate" : "graduates"} at ${name} ${graduateCount === 1 ? "is" : "are"} on Cohortly — they’ll see this first (48h), then past coworkers, then everyone after 5 days.`;
  }
  return `No one from ${name} on Cohortly yet — graduates with matching past companies see it after 48h; all graduates after 5 days.`;
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

/** Diagnostic-only: log full PostgREST / Postgres error fields before friendly mapping. */
export function logReferralError(context: string, error: unknown): void {
  const e = error as {
    message?: string;
    code?: string;
    details?: string;
    hint?: string;
  } | null;
  const code = e?.code ?? null;
  const message = e?.message ?? null;
  const isAmbiguousFn =
    code === "42725" ||
    (typeof message === "string" &&
      (message.includes("is not unique") ||
        message.includes("Could not choose a best candidate")));
  console.error(`[referral] ${context}`, {
    message,
    code,
    details: e?.details ?? null,
    hint: e?.hint ?? null,
    ambiguousFunction: isAmbiguousFn || null,
    note: isAmbiguousFn
      ? "Postgres overload ambiguity (42725) — usually upsert_accepted_conversation; run unique hotfix migration"
      : null,
    raw: error,
    json: (() => {
      try {
        return JSON.stringify(error);
      } catch {
        return String(error);
      }
    })(),
  });
}

export function mapReferralError(
  message: string,
  code?: string | null,
): string {
  const lower = message.toLowerCase();

  if (
    code === "42725" ||
    message.includes("is not unique") ||
    message.includes("Could not choose a best candidate")
  ) {
    return "Couldn't open the chat (server function conflict). Please refresh and try again — if it persists, an admin needs to apply the upsert hotfix.";
  }
  if (message.includes("REFERRAL_ALREADY_TAKEN")) {
    return "Someone else has already taken this.";
  }
  if (message.includes("REFERRAL_OPEN_LIMIT")) {
    return "You can have at most 3 open referral requests at a time.";
  }
  if (message.includes("REFERRAL_COMPANY_LIMIT")) {
    return "You already requested this company in the last 30 days.";
  }
  if (message.includes("MESSAGE_NOT_ALLOWED")) {
    return "Couldn't open the chat for this ask. Please try again.";
  }
  if (
    lower.includes("row-level security") ||
    lower.includes("violates row-level")
  ) {
    return "Couldn't complete that action. Please refresh and try again.";
  }
  if (message.includes("Company mismatch")) {
    if (message.includes("first 48h") || message.includes("target company")) {
      return "This ask is still limited to graduates at that company (first 48 hours). Your profile company doesn't match yet.";
    }
    if (message.includes("past company") || message.includes("5 days")) {
      return "This ask is still limited to current/past company matches. It opens to all graduates after 5 days.";
    }
    return "Your company doesn't match this ask's visibility yet.";
  }
  if (message.includes("NOT_ALLOWED: Only graduates")) {
    return "Only graduates can accept referral requests.";
  }
  if (message.includes("NOT_ALLOWED: You cannot accept your own")) {
    return "You can't accept your own referral request.";
  }
  if (message.includes("NOT_ALLOWED: You cannot accept")) {
    return "You're not allowed to accept this request.";
  }
  if (message.includes("NOT_ALLOWED")) {
    // Prefer the RPC's human-readable suffix when present (after the code prefix).
    const afterCode = message.replace(/^NOT_ALLOWED:\s*/i, "").trim();
    if (afterCode && afterCode.length < 160) return afterCode;
    return "You're not allowed to do that.";
  }
  if (message.includes("REQUEST_NOT_FOUND")) {
    return "That referral request could not be found.";
  }
  return "Something went wrong. Please try again.";
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
