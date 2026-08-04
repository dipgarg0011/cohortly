import type { ConversationRow } from "@/lib/conversations";
import { partnerIdFromConversation } from "@/lib/conversations";
import { formatRelativeTime } from "@/lib/format-time";
import type { Message } from "@/lib/messages";
import { otherPartyId } from "@/lib/messages";
import type { MatchedAsk } from "@/lib/mentorship";
import {
  needsReferralFollowup,
  type ReferralRequest,
} from "@/lib/referrals";
import type { OpportunityApplication } from "@/lib/opportunities";

export type NeedType =
  | "connection"
  | "mentorship"
  | "referral"
  | "application"
  | "unread_turn"
  | "followup";

export type NeedItem = {
  id: string;
  type: NeedType;
  text: string;
  waitedAt: string;
  href: string;
  actionLabel: string;
};

export type NeedPartner = {
  id: string;
  full_name: string | null;
};

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

export function buildNeedsYouItems(input: {
  currentUserId: string;
  conversations: ConversationRow[];
  messages: Message[];
  partners: Record<string, NeedPartner>;
  matchedAsks: MatchedAsk[];
  openReferrals: ReferralRequest[];
  pendingApplications: OpportunityApplication[];
  acceptedReferrals: ReferralRequest[];
}): NeedItem[] {
  const {
    currentUserId,
    conversations,
    messages,
    partners,
    matchedAsks,
    openReferrals,
    pendingApplications,
    acceptedReferrals,
  } = input;

  const items: NeedItem[] = [];
  const seen = new Set<string>();

  function push(item: NeedItem) {
    const key = `${item.type}:${item.href}:${item.text}`;
    if (seen.has(key)) return;
    seen.add(key);
    items.push(item);
  }

  for (const conv of conversations) {
    if (conv.status !== "pending") continue;
    if (conv.recipient_id !== currentUserId) continue;
    const name = firstName(partners[conv.initiator_id]?.full_name);
    push({
      id: `connection:${conv.id}`,
      type: "connection",
      text: `${name} wants to connect`,
      waitedAt: conv.created_at,
      href: `/messages?with=${conv.initiator_id}`,
      actionLabel: "Respond",
    });
  }

  for (const ask of matchedAsks) {
    if (ask.match_status !== "pending") continue;
    const topic = ask.title?.trim() || "mentorship";
    push({
      id: `mentorship:${ask.match_id}`,
      type: "mentorship",
      text: `Student waiting on ${topic}`,
      waitedAt: ask.match_created_at || ask.request_created_at,
      href: "/mentors",
      actionLabel: "Reply",
    });
  }

  for (const ref of openReferrals) {
    if (ref.student_id === currentUserId) continue;
    if (ref.status !== "open") continue;
    const name = firstName(ref.student?.full_name);
    const company = ref.company?.trim() || "a company";
    push({
      id: `referral:${ref.id}`,
      type: "referral",
      text: `${name} asked about ${company}`,
      waitedAt: ref.created_at,
      href: "/referrals",
      actionLabel: "Help",
    });
  }

  for (const app of pendingApplications) {
    if (app.status !== "pending") continue;
    const name = firstName(app.applicant?.full_name);
    const title = app.opportunity?.title?.trim() || "your posting";
    push({
      id: `application:${app.id}`,
      type: "application",
      text: `${name} applied to ${title}`,
      waitedAt: app.created_at,
      href: "/opportunities",
      actionLabel: "Review",
    });
  }

  for (const conv of conversations) {
    if (conv.status !== "accepted") continue;
    if (!canActOnTurn(conv, currentUserId)) continue;
    const partnerId = partnerIdFromConversation(conv, currentUserId);
    const unread = unreadFromPartner(messages, currentUserId, partnerId);
    if (!unread) continue;
    const name = firstName(partners[partnerId]?.full_name);
    push({
      id: `unread:${conv.id}`,
      type: "unread_turn",
      text: `Unread from ${name}`,
      waitedAt: unread.created_at,
      href: `/messages?with=${partnerId}`,
      actionLabel: "Open",
    });
  }

  for (const ref of acceptedReferrals) {
    if (!needsReferralFollowup(ref, currentUserId)) continue;
    const company = ref.company?.trim() || "this role";
    push({
      id: `followup-ref:${ref.id}`,
      type: "followup",
      text: `Follow up on ${company} referral`,
      waitedAt: ref.accepted_at || ref.created_at,
      href: "/referrals",
      actionLabel: "Update",
    });
  }

  for (const conv of conversations) {
    if (conv.status !== "accepted") continue;
    if ((conv.gate_mode ?? "open") !== "turn_based") continue;
    if (conv.turn_holder !== currentUserId) continue;
    const partnerId = partnerIdFromConversation(conv, currentUserId);
    const last = lastMessageByConversation(messages, currentUserId, partnerId);
    if (!last || last.sender_id === currentUserId) continue;
    // Skip if already covered as unread_turn
    if (items.some((i) => i.id === `unread:${conv.id}`)) continue;
    const name = firstName(partners[partnerId]?.full_name);
    push({
      id: `followup-turn:${conv.id}`,
      type: "followup",
      text: `Reply to ${name}`,
      waitedAt: last.created_at,
      href: `/messages?with=${partnerId}`,
      actionLabel: "Reply",
    });
  }

  items.sort(
    (a, b) => new Date(a.waitedAt).getTime() - new Date(b.waitedAt).getTime(),
  );

  return items;
}

/** Waiting-duration label — shared relative/absolute formatter. */
export function waitedLabel(iso: string, now = new Date()): string {
  return formatRelativeTime(iso, now);
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
