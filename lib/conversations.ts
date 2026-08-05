export type ConversationStatus =
  | "pending"
  | "accepted"
  | "declined"
  | "blocked";

export type UnlockReason =
  | "manual_accept"
  | "referral"
  | "mentorship"
  | "referral_question"
  | "opportunity_application";

export type ContextType =
  | "connection"
  | "referral"
  | "referral_question"
  | "mentorship"
  | "opportunity";

export type ContextSnapshot = {
  title?: string | null;
  company?: string | null;
  role?: string | null;
  category?: string | null;
  type?: string | null;
  description?: string | null;
  pitch?: string | null;
  request_id?: string | null;
  question_id?: string | null;
  opportunity_id?: string | null;
  application_id?: string | null;
  student_id?: string | null;
  is_anonymous?: boolean | null;
};

export type GateMode = "locked" | "turn_based" | "open";

export type ConversationRow = {
  id: string;
  initiator_id: string;
  recipient_id: string;
  status: ConversationStatus;
  unlock_reason: UnlockReason | null;
  /** Stable unlock source type (preferred over unlock_reason for UI). */
  context_type?: ContextType | null;
  /** Polymorphic source id (referral / mentorship / opportunity application). */
  context_id?: string | null;
  /** Frozen header fields captured at unlock. */
  context_snapshot?: ContextSnapshot | Record<string, unknown> | null;
  /** Mentorship-only legacy FK — kept in sync with context_id for mentorship. */
  context_request_id?: string | null;
  intro_message_sent: boolean;
  created_at: string;
  updated_at: string;
  gate_mode?: GateMode;
  turn_holder?: string | null;
  reply_count_by_recipient?: number;
  gate_lifted_at?: string | null;
  gate_student_id?: string | null;
  turn_nudge_sent_at?: string | null;
};

export const CONVERSATION_SELECT =
  "id, initiator_id, recipient_id, status, unlock_reason, context_type, context_id, context_snapshot, context_request_id, intro_message_sent, created_at, updated_at, gate_mode, turn_holder, reply_count_by_recipient, gate_lifted_at, gate_student_id, turn_nudge_sent_at";

export function resolveContextType(
  conv: Pick<ConversationRow, "context_type" | "unlock_reason">,
): ContextType | null {
  if (conv.context_type) return conv.context_type;
  switch (conv.unlock_reason) {
    case "referral":
      return "referral";
    case "referral_question":
      return "referral_question";
    case "mentorship":
      return "mentorship";
    case "opportunity_application":
      return "opportunity";
    case "manual_accept":
      return "connection";
    default:
      return null;
  }
}

export const INTRO_MESSAGE_MAX = 300;
export const INTRO_MESSAGE_MIN = 20;
export const TURN_FOLLOWUP_MAX = 500;

/** Student view only — mentors should never see restriction UI. */
export function studentTurnGate(
  conv: ConversationRow | undefined,
  currentUserId: string,
): {
  isTurnBased: boolean;
  isStudent: boolean;
  canSend: boolean;
  waitingOnMentor: boolean;
} {
  if (!conv || conv.status !== "accepted") {
    return {
      isTurnBased: false,
      isStudent: false,
      canSend: true,
      waitingOnMentor: false,
    };
  }
  const mode = conv.gate_mode ?? "open";
  if (mode !== "turn_based" || !conv.gate_student_id) {
    return {
      isTurnBased: false,
      isStudent: false,
      canSend: true,
      waitingOnMentor: false,
    };
  }
  const isStudent = conv.gate_student_id === currentUserId;
  if (!isStudent) {
    // Mentor side: no restriction UI
    return {
      isTurnBased: true,
      isStudent: false,
      canSend: true,
      waitingOnMentor: false,
    };
  }
  const holdsTurn = conv.turn_holder === currentUserId;
  return {
    isTurnBased: true,
    isStudent: true,
    canSend: holdsTurn,
    waitingOnMentor: !holdsTurn,
  };
}

export function partnerIdFromConversation(
  conv: ConversationRow,
  currentUserId: string,
): string {
  return conv.initiator_id === currentUserId
    ? conv.recipient_id
    : conv.initiator_id;
}

export function findConversationWith(
  conversations: ConversationRow[],
  currentUserId: string,
  otherUserId: string,
): ConversationRow | undefined {
  return conversations.find((c) => {
    const a = c.initiator_id;
    const b = c.recipient_id;
    return (
      (a === currentUserId && b === otherUserId) ||
      (a === otherUserId && b === currentUserId)
    );
  });
}

export type ConnectionAction =
  | { kind: "send_request" }
  | { kind: "message" }
  | { kind: "request_sent" }
  | { kind: "hidden" };

export function connectionActionFor(
  conv: ConversationRow | undefined,
): ConnectionAction {
  if (!conv) return { kind: "send_request" };
  if (conv.status === "accepted") return { kind: "message" };
  if (conv.status === "pending") return { kind: "request_sent" };
  return { kind: "hidden" };
}

/** Short inbox / dashboard label from unlock reason / context type + detail. */
export function conversationContextLabel(
  unlockReason: UnlockReason | ContextType | null | undefined,
  title?: string | null,
): string | null {
  const t = title?.trim();
  switch (unlockReason) {
    case "mentorship":
      return t ? `Mentorship · ${t}` : "Mentorship";
    case "referral":
    case "referral_question":
      return t ? `Referral · ${t}` : "Referral";
    case "opportunity":
    case "opportunity_application":
      return t ? `Opportunity · ${t}` : "Opportunity";
    case "connection":
    case "manual_accept":
    default:
      return null;
  }
}

/** Label from conversation row using context_type / context_snapshot when present. */
export function conversationLabelFromRow(
  conv: ConversationRow,
): string | null {
  const type = resolveContextType(conv);
  if (!type || type === "connection") return null;
  const snap = (conv.context_snapshot ?? {}) as ContextSnapshot;
  const detail =
    type === "referral" || type === "referral_question"
      ? snap.company || snap.role || snap.title
      : type === "opportunity"
        ? snap.company || snap.role || snap.title
        : snap.title || snap.company;
  return conversationContextLabel(type, detail ?? null);
}

/** Map Postgres / Supabase errors to readable copy. Never surface raw SQL. */
export function mapMessagingError(
  error: { message?: string; code?: string } | null | undefined,
): string {
  const msg = error?.message ?? "";

  if (msg.includes("DAILY_REQUEST_LIMIT")) {
    return "You can only send 5 connection requests per day. Try again tomorrow.";
  }

  if (msg.includes("TURN_GATE_LIMIT")) {
    return "Follow-ups are limited to 500 characters until you can chat freely.";
  }

  if (msg.includes("MESSAGE_NOT_ALLOWED")) {
    return "You've already used your intro message. Wait for them to accept before chatting more.";
  }

  const lower = msg.toLowerCase();
  if (
    lower.includes("row-level security") ||
    lower.includes("violates row-level") ||
    error?.code === "42501"
  ) {
    return "You can't send a message in this conversation right now.";
  }

  if (lower.includes("only the recipient")) {
    return "Only the recipient can respond to this request.";
  }

  // Never surface raw Postgres / PostgREST text to users
  if (msg.trim()) {
    return "Something went wrong. Please try again.";
  }

  return "Something went wrong. Please try again.";
}
