import type { ConversationRow } from "@/lib/conversations";
import { partnerIdFromConversation } from "@/lib/conversations";
import { formatRelativeTime } from "@/lib/format-time";
import type { Message } from "@/lib/messages";
import { otherPartyId } from "@/lib/messages";
import type { MatchedAsk } from "@/lib/mentorship";
import type { ReferralRequest } from "@/lib/referrals";
import type { OpportunityApplication } from "@/lib/opportunities";

export type NeedType =
  | "connection"
  | "mentorship"
  | "referral"
  | "application"
  | "unread_turn"
  | "followup";

/** Inline actions the bubble can run without leaving the dashboard. */
export type NeedInlineAction = "accept" | "decline" | "reply";

/**
 * Priority bands (lower = higher):
 * 1 — waiting on you (referral / mentorship / undecided applications);
 *     deadline-within-48h sorts first inside this band
 * 2 — conversations where you hold the turn
 * 4 — pending connection requests
 *
 * (Band 3 in product language = deadline boost inside band 1, not a demotion.)
 */
export type NeedPriority = 1 | 2 | 3 | 4;

export type NeedItem = {
  id: string;
  type: NeedType;
  text: string;
  waitedAt: string;
  href: string;
  /** Primary CTA label (named action, never generic "Help"). */
  actionLabel: string;
  entityId: string;
  inlineActions: NeedInlineAction[];
  partnerId?: string | null;
  deadline?: string | null;
  studentId?: string | null;
  requestId?: string | null;
  urgent: boolean;
  priority: NeedPriority;
};

export type NeedPartner = {
  id: string;
  full_name: string | null;
};

const MS_HOUR = 1000 * 60 * 60;
const MS_DAY = MS_HOUR * 24;

function firstName(name: string | null | undefined, fallback = "Someone"): string {
  const trimmed = name?.trim();
  if (!trimmed) return fallback;
  return trimmed.split(/\s+/)[0] ?? fallback;
}

function lastMessageByConversation(
  messages: Message[],
  currentUserId: string,
  partnerId: string,
): Message | undefined {
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i];
    if (!m) continue;
    const other = otherPartyId(m, currentUserId);
    if (other === partnerId) return m;
  }
  return undefined;
}

function unreadFromPartner(
  messages: Message[],
  currentUserId: string,
  partnerId: string,
): Message | undefined {
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i];
    if (!m) continue;
    if (m.receiver_id === currentUserId && !m.read && m.sender_id === partnerId) {
      return m;
    }
  }
  return undefined;
}

function canActOnTurn(conv: ConversationRow, currentUserId: string): boolean {
  if (conv.status !== "accepted") return false;
  const mode = conv.gate_mode ?? "open";
  if (mode === "locked") return false;
  if (mode === "turn_based") {
    return conv.turn_holder === currentUserId;
  }
  return true;
}

/** Parse deadline (date or ISO) to end-of-day ms when date-only. */
export function deadlineEndMs(deadline: string | null | undefined): number | null {
  if (!deadline) return null;
  const raw = deadline.trim();
  if (!raw) return null;
  const end = raw.length <= 10 ? new Date(`${raw}T23:59:59`) : new Date(raw);
  const t = end.getTime();
  return Number.isNaN(t) ? null : t;
}

export function isDeadlineWithin(deadline: string | null | undefined, hours: number, now = Date.now()): boolean {
  const end = deadlineEndMs(deadline);
  if (end == null) return false;
  const remaining = end - now;
  return remaining >= 0 && remaining <= hours * MS_HOUR;
}

export function isWaitingUrgent(waitedAt: string, now = Date.now()): boolean {
  const t = new Date(waitedAt).getTime();
  if (Number.isNaN(t)) return false;
  return now - t > 3 * MS_DAY;
}

export function computeNeedUrgent(
  waitedAt: string,
  deadline?: string | null,
  now = Date.now(),
): boolean {
  return isWaitingUrgent(waitedAt, now) || isDeadlineWithin(deadline, 24, now);
}

function sortNeeds(items: NeedItem[]): NeedItem[] {
  return [...items].sort((a, b) => {
    if (a.priority !== b.priority) return a.priority - b.priority;
    const aSoon = isDeadlineWithin(a.deadline, 48) ? 0 : 1;
    const bSoon = isDeadlineWithin(b.deadline, 48) ? 0 : 1;
    if (aSoon !== bSoon) return aSoon - bSoon;
    return new Date(a.waitedAt).getTime() - new Date(b.waitedAt).getTime();
  });
}

/**
 * Build actionable "Needs you" items — only where someone is blocked on this user.
 * Excludes profile nudges, suggested people, and self-followups.
 */
export function buildNeedsYouItems(input: {
  currentUserId: string;
  conversations: ConversationRow[];
  messages: Message[];
  partners: Record<string, NeedPartner>;
  matchedAsks: MatchedAsk[];
  openReferrals: ReferralRequest[];
  pendingApplications: OpportunityApplication[];
  /** @deprecated Ignored — self follow-ups are noise, not blockers on this user. */
  acceptedReferrals?: ReferralRequest[];
  now?: Date;
}): NeedItem[] {
  const {
    currentUserId,
    conversations,
    messages,
    partners,
    matchedAsks,
    openReferrals,
    pendingApplications,
    now: nowDate = new Date(),
  } = input;
  const now = nowDate.getTime();

  const items: NeedItem[] = [];
  const seen = new Set<string>();

  function push(item: NeedItem) {
    const key = `${item.type}:${item.entityId}`;
    if (seen.has(key)) return;
    seen.add(key);
    items.push(item);
  }

  // —— Priority 1: waiting blockers (referral / mentorship / applications) ——
  for (const ref of openReferrals) {
    if (ref.student_id === currentUserId) continue;
    if (ref.status !== "open") continue;
    const name = firstName(ref.student?.full_name);
    const company = ref.company?.trim() || "a company";
    const deadline = ref.deadline;
    const waitedAt = ref.created_at;
    push({
      id: `referral:${ref.id}`,
      type: "referral",
      text: `${name} asked about ${company}`,
      waitedAt,
      href: "/referrals",
      actionLabel: "Accept",
      entityId: ref.id,
      inlineActions: ["accept", "decline"],
      partnerId: ref.student_id,
      deadline,
      urgent: computeNeedUrgent(waitedAt, deadline, now),
      priority: 1,
    });
  }

  for (const ask of matchedAsks) {
    if (ask.match_status !== "pending") continue;
    const name = firstName(ask.student_full_name, "A student");
    const topic = ask.title?.trim() || "mentorship";
    const waitedAt = ask.match_created_at || ask.request_created_at;
    const deadline = ask.expires_at ?? null;
    push({
      id: `mentorship:${ask.match_id}`,
      type: "mentorship",
      text: `${name} asked about ${topic}`,
      waitedAt,
      href: "/mentors",
      actionLabel: "Accept",
      entityId: ask.match_id,
      inlineActions: ["accept", "decline"],
      partnerId: ask.student_id,
      studentId: ask.student_id,
      requestId: ask.request_id,
      deadline,
      urgent: computeNeedUrgent(waitedAt, deadline, now),
      priority: 1,
    });
  }

  for (const app of pendingApplications) {
    if (app.status !== "pending") continue;
    const name = firstName(app.applicant?.full_name);
    const title = app.opportunity?.title?.trim() || "your posting";
    const deadline = app.opportunity?.deadline ?? null;
    const waitedAt = app.created_at;
    push({
      id: `application:${app.id}`,
      type: "application",
      text: `${name} applied to ${title}`,
      waitedAt,
      href: "/opportunities",
      actionLabel: "Accept",
      entityId: app.id,
      inlineActions: ["accept", "decline"],
      partnerId: app.applicant_id,
      deadline,
      urgent: computeNeedUrgent(waitedAt, deadline, now),
      priority: 1,
    });
  }

  // —— Priority 2: conversations where you hold the turn ——
  for (const conv of conversations) {
    if (conv.status !== "accepted") continue;
    if (!canActOnTurn(conv, currentUserId)) continue;
    const partnerId = partnerIdFromConversation(conv, currentUserId);
    const unread = unreadFromPartner(messages, currentUserId, partnerId);
    if (!unread) continue;
    const name = firstName(partners[partnerId]?.full_name);
    const waitedAt = unread.created_at;
    push({
      id: `unread:${conv.id}`,
      type: "unread_turn",
      text: `Unread from ${name}`,
      waitedAt,
      href: `/messages?with=${partnerId}`,
      actionLabel: "Reply",
      entityId: conv.id,
      inlineActions: ["reply"],
      partnerId,
      urgent: computeNeedUrgent(waitedAt, null, now),
      priority: 2,
    });
  }

  for (const conv of conversations) {
    if (conv.status !== "accepted") continue;
    if ((conv.gate_mode ?? "open") !== "turn_based") continue;
    if (conv.turn_holder !== currentUserId) continue;
    const partnerId = partnerIdFromConversation(conv, currentUserId);
    const last = lastMessageByConversation(messages, currentUserId, partnerId);
    if (!last || last.sender_id === currentUserId) continue;
    if (items.some((i) => i.id === `unread:${conv.id}`)) continue;
    const name = firstName(partners[partnerId]?.full_name);
    const waitedAt = last.created_at;
    push({
      id: `followup-turn:${conv.id}`,
      type: "followup",
      text: `Reply to ${name}`,
      waitedAt,
      href: `/messages?with=${partnerId}`,
      actionLabel: "Reply",
      entityId: conv.id,
      inlineActions: ["reply"],
      partnerId,
      urgent: computeNeedUrgent(waitedAt, null, now),
      priority: 2,
    });
  }

  // —— Priority 4: pending connection requests ——
  for (const conv of conversations) {
    if (conv.status !== "pending") continue;
    if (conv.recipient_id !== currentUserId) continue;
    const name = firstName(partners[conv.initiator_id]?.full_name);
    const waitedAt = conv.created_at;
    push({
      id: `connection:${conv.id}`,
      type: "connection",
      text: `${name} wants to connect`,
      waitedAt,
      href: `/messages?with=${conv.initiator_id}`,
      actionLabel: "Accept",
      entityId: conv.id,
      inlineActions: ["accept", "decline"],
      partnerId: conv.initiator_id,
      urgent: computeNeedUrgent(waitedAt, null, now),
      priority: 4,
    });
  }

  return sortNeeds(items);
}

/** Waiting-duration label — shared relative/absolute formatter. */
export function waitedLabel(iso: string, now = new Date()): string {
  return formatRelativeTime(iso, now);
}

export function needsCountLabel(count: number): string {
  if (count === 1) return "1 thing needs you";
  return `${count} things need you`;
}

export function seeAllHrefForNeeds(items: NeedItem[]): string {
  if (items.length === 0) return "/messages";
  const counts: Partial<Record<NeedType, number>> = {};
  for (const item of items) {
    counts[item.type] = (counts[item.type] ?? 0) + 1;
  }
  const ranked = (Object.entries(counts) as [NeedType, number][]).sort(
    (a, b) => b[1] - a[1],
  );
  const top = ranked[0]?.[0];
  switch (top) {
    case "mentorship":
      return "/mentors";
    case "referral":
    case "followup":
      return "/referrals";
    case "application":
      return "/opportunities";
    case "connection":
    case "unread_turn":
    default:
      return "/messages";
  }
}
