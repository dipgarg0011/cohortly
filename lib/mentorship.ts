import { formatAbsoluteTime } from "@/lib/format-time";
import { SKILL_OPTIONS } from "@/lib/network";

export type MentorAvailability = {
  id: string;
  mentor_id: string;
  is_available: boolean;
  session_lengths: number[];
  bio_note: string | null;
  max_open_requests: number;
  topics: string[];
  answers_given: number;
  created_at: string;
};

export type OfficeHour = {
  id: string;
  mentor_id: string;
  day_of_week: number;
  start_time: string;
  end_time: string;
  is_active: boolean;
  created_at: string;
};

export type BookingStatus = "pending" | "confirmed" | "declined" | "completed";

export type MentorBooking = {
  id: string;
  mentor_id: string;
  student_id: string;
  duration_minutes: number;
  requested_time: string;
  status: BookingStatus;
  notes: string | null;
  created_at: string;
  mentor?: MentorProfileSnippet | null;
  student?: MentorProfileSnippet | null;
};

export type MentorProfileSnippet = {
  id: string;
  full_name: string | null;
  batch_year: number | null;
  company: string | null;
  role_title: string | null;
  current_job: string | null;
  avatar_url: string | null;
  department: string | null;
  skills?: string[] | null;
};

export type AvailableMentor = {
  availability: MentorAvailability;
  profile: MentorProfileSnippet;
  officeHours: OfficeHour[];
};

export const MENTORSHIP_CATEGORIES = [
  "Career",
  "Interviews",
  "Higher Studies",
  "Startup",
  "Skills",
  "Other",
] as const;

export type MentorshipCategory = (typeof MENTORSHIP_CATEGORIES)[number];

export const URGENCY_OPTIONS = [
  { value: "urgent", label: "Urgent" },
  { value: "this_week", label: "This week" },
  { value: "flexible", label: "Flexible" },
] as const;

export type Urgency = (typeof URGENCY_OPTIONS)[number]["value"];

export type MentorshipRequestStatus =
  | "open"
  | "matched"
  | "closed"
  | "expired"
  | "awaiting_resolution";

export type MentorshipResolution =
  | "answered"
  | "accepted"
  | "no_match"
  | "withdrawn"
  | "archived_unanswered"
  | "posted_public"
  | "reposted"
  | "moved_referrals"
  | "watching";

export type MatchStatus =
  | "pending"
  | "accepted"
  | "declined"
  | "referred"
  | "expired"
  | "answered";

export type MentorshipRequest = {
  id: string;
  student_id: string;
  title: string;
  description: string;
  tags: string[];
  category: MentorshipCategory | null;
  target_company: string | null;
  urgency: Urgency;
  preferred_duration: 30 | 60;
  status: MentorshipRequestStatus;
  expires_at: string;
  created_at: string;
  is_anonymous: boolean;
  revealed_at: string | null;
  quality_score: number;
  reach_stage: number;
  last_escalated_at: string | null;
  nudge_count: number;
  resolution: MentorshipResolution | null;
  is_public_after_expiry: boolean;
  awaiting_resolution_at: string | null;
  student?: MentorProfileSnippet | null;
};

export type MentorshipLiveState = {
  request_id: string;
  computed_stage: number;
  stored_stage: number;
  match_count: number;
  pending_count: number;
  unanswered_pending: number;
  has_answer: boolean;
  age_days: number;
  status: MentorshipRequestStatus;
  resolution: MentorshipResolution | null;
};

export type RequestMatch = {
  id: string;
  request_id: string;
  mentor_id: string;
  match_score: number;
  match_reasons: string[];
  status: MatchStatus;
  referred_to: string | null;
  referred_by: string | null;
  responded_at: string | null;
  created_at: string;
  request?: MentorshipRequest | null;
  mentor?: MentorProfileSnippet | null;
  student?: MentorProfileSnippet | null;
};

/** Row from list_my_matched_asks() — identity may be masked */
export type MatchedAsk = {
  match_id: string;
  match_status: MatchStatus;
  match_score: number;
  match_reasons: string[];
  referred_by: string | null;
  match_created_at: string;
  match_responded_at: string | null;
  request_id: string;
  title: string;
  description: string;
  tags: string[];
  category: MentorshipCategory | null;
  target_company: string | null;
  urgency: Urgency;
  preferred_duration: 30 | 60;
  request_status: MentorshipRequestStatus;
  expires_at: string;
  request_created_at: string;
  is_anonymous: boolean;
  revealed_at: string | null;
  quality_score: number;
  student_id: string | null;
  student_full_name: string | null;
  student_avatar_url: string | null;
  student_department: string | null;
  student_batch_year: number | null;
};

export type RequestAnswer = {
  id: string;
  request_id: string;
  match_id: string;
  mentor_id: string;
  content: string;
  is_public: boolean;
  helpful: boolean | null;
  created_at: string;
  mentor?: MentorProfileSnippet | null;
};

export const TOPIC_OPTIONS = [...SKILL_OPTIONS] as string[];

const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;

export function formatTimeLabel(time: string): string {
  const [hStr, mStr] = time.split(":");
  let hours = Number(hStr);
  const minutes = Number(mStr ?? 0);
  if (Number.isNaN(hours)) return time;
  const suffix = hours >= 12 ? "pm" : "am";
  hours = hours % 12 || 12;
  if (minutes === 0) return `${hours}${suffix}`;
  return `${hours}:${String(minutes).padStart(2, "0")}${suffix}`;
}

export function formatOfficeHoursSummary(hours: OfficeHour[]): string | null {
  const active = hours.filter((h) => h.is_active);
  if (active.length === 0) return null;

  const parts = active
    .slice()
    .sort(
      (a, b) =>
        a.day_of_week - b.day_of_week ||
        a.start_time.localeCompare(b.start_time),
    )
    .map((h) => {
      const day = DAY_NAMES[h.day_of_week] ?? `Day ${h.day_of_week}`;
      return `${day} ${formatTimeLabel(h.start_time)}-${formatTimeLabel(h.end_time)}`;
    });

  return `Recurring office hours: ${parts.join(", ")}`;
}

/** Booking slot label — absolute local date/time. */
export function formatBookingTime(iso: string): string {
  return formatAbsoluteTime(iso) || iso;
}

export function formatRelativeExpiry(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  const days = Math.ceil(
    (date.getTime() - Date.now()) / (1000 * 60 * 60 * 24),
  );
  if (days < 0) return "Expired";
  if (days === 0) return "Expires today";
  if (days === 1) return "Expires tomorrow";
  return `Expires in ${days} days`;
}

function asOne<T>(value: T | T[] | null | undefined): T | null {
  if (!value) return null;
  return Array.isArray(value) ? (value[0] ?? null) : value;
}

export function normalizeBooking(row: Record<string, unknown>): MentorBooking {
  return {
    id: row.id as string,
    mentor_id: row.mentor_id as string,
    student_id: row.student_id as string,
    duration_minutes: row.duration_minutes as number,
    requested_time: row.requested_time as string,
    status: row.status as BookingStatus,
    notes: (row.notes as string | null) ?? null,
    created_at: row.created_at as string,
    mentor: asOne(
      row.mentor as MentorProfileSnippet | MentorProfileSnippet[] | null,
    ),
    student: asOne(
      row.student as MentorProfileSnippet | MentorProfileSnippet[] | null,
    ),
  };
}

export function normalizeMentorshipRequest(
  row: Record<string, unknown>,
): MentorshipRequest {
  return {
    id: row.id as string,
    student_id: row.student_id as string,
    title: row.title as string,
    description: row.description as string,
    tags: (row.tags as string[]) ?? [],
    category: (row.category as MentorshipCategory | null) ?? null,
    target_company: (row.target_company as string | null) ?? null,
    urgency: (row.urgency as Urgency) ?? "flexible",
    preferred_duration: (row.preferred_duration as 30 | 60) ?? 30,
    status: row.status as MentorshipRequestStatus,
    expires_at: row.expires_at as string,
    created_at: row.created_at as string,
    is_anonymous: Boolean(row.is_anonymous),
    revealed_at: (row.revealed_at as string | null) ?? null,
    quality_score: Number(row.quality_score ?? 0),
    reach_stage: Number(row.reach_stage ?? 1),
    last_escalated_at: (row.last_escalated_at as string | null) ?? null,
    nudge_count: Number(row.nudge_count ?? 0),
    resolution: (row.resolution as MentorshipResolution | null) ?? null,
    is_public_after_expiry:
      row.is_public_after_expiry == null
        ? true
        : Boolean(row.is_public_after_expiry),
    awaiting_resolution_at:
      (row.awaiting_resolution_at as string | null) ?? null,
    student: asOne(
      row.student as MentorProfileSnippet | MentorProfileSnippet[] | null,
    ),
  };
}

export function normalizeLiveState(
  row: Record<string, unknown>,
): MentorshipLiveState {
  return {
    request_id: row.request_id as string,
    computed_stage: Number(row.computed_stage ?? 1),
    stored_stage: Number(row.stored_stage ?? 1),
    match_count: Number(row.match_count ?? 0),
    pending_count: Number(row.pending_count ?? 0),
    unanswered_pending: Number(row.unanswered_pending ?? 0),
    has_answer: Boolean(row.has_answer),
    age_days: Number(row.age_days ?? 0),
    status: row.status as MentorshipRequestStatus,
    resolution: (row.resolution as MentorshipResolution | null) ?? null,
  };
}

/** Plain-language status for My asks — never silent. */
export function liveStateCopy(
  state: MentorshipLiveState,
  department?: string | null,
): string {
  if (state.has_answer) {
    return "You have a reply — ask a follow-up if you need more.";
  }
  if (state.status === "awaiting_resolution") {
    return "Still unanswered — here's what you can do";
  }
  if (state.resolution === "watching") {
    return "We'll notify you when someone relevant joins.";
  }
  if (state.resolution === "posted_public") {
    return "Posted publicly — any graduate can pick this up.";
  }
  if (state.match_count === 0) {
    return "No graduates matched yet — we'll widen this automatically.";
  }

  const stage = state.computed_stage;
  const pending = state.pending_count;
  const openedish = Math.max(0, state.match_count - state.unanswered_pending);

  if (stage >= 4) {
    return "Still unanswered — visible to all graduates";
  }
  if (stage === 3) {
    const dept = department?.trim();
    return dept
      ? `Now visible to all graduates in ${dept}`
      : "Now visible to more graduates in your department";
  }
  if (pending > 0 && openedish === 0) {
    return `Sent to ${state.match_count} graduate${state.match_count === 1 ? "" : "s"} · ${pending} haven't opened it yet`;
  }
  if (pending > 0) {
    return `No response yet — opening this to more people ${stage < 2 ? "in a few days" : "soon"}`;
  }
  return `Sent to ${state.match_count} graduate${state.match_count === 1 ? "" : "s"} — waiting on a reply`;
}

export function stageLabel(stage: number): string {
  const s = Math.min(4, Math.max(1, Math.round(stage)));
  return `Stage ${s} of 4`;
}

export function normalizeMatchedAsk(row: Record<string, unknown>): MatchedAsk {
  return {
    match_id: row.match_id as string,
    match_status: row.match_status as MatchStatus,
    match_score: Number(row.match_score ?? 0),
    match_reasons: (row.match_reasons as string[]) ?? [],
    referred_by: (row.referred_by as string | null) ?? null,
    match_created_at: row.match_created_at as string,
    match_responded_at: (row.match_responded_at as string | null) ?? null,
    request_id: row.request_id as string,
    title: row.title as string,
    description: row.description as string,
    tags: (row.tags as string[]) ?? [],
    category: (row.category as MentorshipCategory | null) ?? null,
    target_company: (row.target_company as string | null) ?? null,
    urgency: (row.urgency as Urgency) ?? "flexible",
    preferred_duration: (row.preferred_duration as 30 | 60) ?? 30,
    request_status: row.request_status as MentorshipRequestStatus,
    expires_at: row.expires_at as string,
    request_created_at: row.request_created_at as string,
    is_anonymous: Boolean(row.is_anonymous),
    revealed_at: (row.revealed_at as string | null) ?? null,
    quality_score: Number(row.quality_score ?? 0),
    student_id: (row.student_id as string | null) ?? null,
    student_full_name: (row.student_full_name as string | null) ?? null,
    student_avatar_url: (row.student_avatar_url as string | null) ?? null,
    student_department: (row.student_department as string | null) ?? null,
    student_batch_year:
      row.student_batch_year == null
        ? null
        : Number(row.student_batch_year),
  };
}

export function normalizeRequestAnswer(
  row: Record<string, unknown>,
): RequestAnswer {
  return {
    id: row.id as string,
    request_id: row.request_id as string,
    match_id: row.match_id as string,
    mentor_id: row.mentor_id as string,
    content: row.content as string,
    is_public: Boolean(row.is_public),
    helpful:
      row.helpful === null || row.helpful === undefined
        ? null
        : Boolean(row.helpful),
    created_at: row.created_at as string,
    mentor: asOne(
      row.mentor as MentorProfileSnippet | MentorProfileSnippet[] | null,
    ),
  };
}

/** Live draft-help checklist — mirrors DB quality heuristics loosely */
export type DraftHelpChecks = {
  goal: boolean;
  tried: boolean;
  specific: boolean;
  score: number;
};

export function evaluateDraftHelp(description: string): DraftHelpChecks {
  const d = description.toLowerCase();
  const trimmed = description.trim();

  const goal =
    /(want to|looking to|aim(ing)?|goal|preparing for|working towards|hoping to|trying to (get|land|break|switch)|career|interview|admit|offer|internship|job)/i.test(
      d,
    ) || trimmed.length >= 80;

  const tried =
    /(tried|already|attempted|so far|looked into|researched|went through|practi[cs]ed|read|watched|applied|failed|didn't work|have been)/i.test(
      d,
    );

  const specific =
    d.includes("?") ||
    /(how (do|can|should|would)|what (should|would|is the best)|which|when should|could you|can you (help|review|walk)|specifically|concrete|example)/i.test(
      d,
    ) ||
    trimmed.length >= 160;

  return {
    goal,
    tried,
    specific,
    score: Number(goal) + Number(tried) + Number(specific),
  };
}

export function identityIsMasked(ask: MatchedAsk): boolean {
  return ask.is_anonymous && !ask.student_id;
}

export function normalizeRequestMatch(
  row: Record<string, unknown>,
): RequestMatch {
  const requestRaw = row.request as Record<string, unknown> | Record<string, unknown>[] | null | undefined;
  const requestOne = asOne(requestRaw);
  return {
    id: row.id as string,
    request_id: row.request_id as string,
    mentor_id: row.mentor_id as string,
    match_score: Number(row.match_score ?? 0),
    match_reasons: (row.match_reasons as string[]) ?? [],
    status: row.status as MatchStatus,
    referred_to: (row.referred_to as string | null) ?? null,
    referred_by: (row.referred_by as string | null) ?? null,
    responded_at: (row.responded_at as string | null) ?? null,
    created_at: row.created_at as string,
    request: requestOne
      ? normalizeMentorshipRequest(requestOne)
      : null,
    mentor: asOne(
      row.mentor as MentorProfileSnippet | MentorProfileSnippet[] | null,
    ),
    student: asOne(
      row.student as MentorProfileSnippet | MentorProfileSnippet[] | null,
    ),
  };
}

export function mapMentorshipError(
  error: { message?: string; code?: string } | null | undefined,
): string {
  const msg = error?.message ?? "";

  if (msg.includes("TURN_GATE_LIMIT")) {
    return "Follow-ups are limited to 500 characters until the chat opens fully.";
  }
  if (msg.includes("INVALID_ACTION")) {
    return "That resolution option isn't available.";
  }
  if (msg.includes("REQUEST_NOT_FOUND")) {
    return "That mentorship request could not be found.";
  }
  if (msg.includes("MATCH_NOT_FOUND")) {
    return "That match could not be found.";
  }
  if (msg.includes("NOT_ALLOWED")) {
    return "You're not allowed to do that.";
  }
  if (msg.includes("MATCH_NOT_OPEN")) {
    return "You can only answer an open match.";
  }
  if (msg.includes("MATCH_NOT_PENDING")) {
    return "Only pending matches can be updated.";
  }
  if (msg.includes("INVALID_REFERRAL")) {
    return "Pick a different graduate to refer this ask to.";
  }
  if (msg.toLowerCase().includes("check constraint")) {
    return "Please fill in a clear title, description, and at least one tag.";
  }
  if (msg.toLowerCase().includes("row-level security")) {
    return "You don't have permission to do that.";
  }

  return "Something went wrong. Please try again.";
}

export const DAY_OPTIONS = DAY_NAMES.map((label, value) => ({ label, value }));

export const URGENCY_LABEL: Record<Urgency, string> = {
  urgent: "Urgent",
  this_week: "This week",
  flexible: "Flexible",
};

export const REQUEST_STATUS_LABEL: Record<MentorshipRequestStatus, string> = {
  open: "Looking for a mentor",
  matched: "Matched",
  closed: "Closed",
  expired: "Expired",
  awaiting_resolution: "Needs a decision",
};
