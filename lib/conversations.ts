export type ConversationStatus =
  | "pending"
  | "accepted"
  | "declined"
  | "blocked";

export type UnlockReason =
  | "manual_accept"
  | "referral"
  | "mentorship"
  | "referral_question";

export type GateMode = "locked" | "turn_based" | "open";

export type ConversationRow = {
  id: string;
  initiator_id: string;
  recipient_id: string;
  status: ConversationStatus;
  unlock_reason: UnlockReason | null;
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

export const INTRO_MESSAGE_MAX = 300;
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

  return "Something went wrong. Please try again.";
}
