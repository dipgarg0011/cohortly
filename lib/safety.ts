import type { SupabaseClient } from "@supabase/supabase-js";
import type { ConversationRow } from "@/lib/conversations";

export const REPORT_REASONS = [
  { id: "harassment", label: "Harassment or bullying" },
  { id: "spam", label: "Spam or unwanted messages" },
  { id: "inappropriate", label: "Inappropriate content" },
  { id: "scam", label: "Scam or phishing" },
  { id: "other", label: "Something else" },
] as const;

export type ReportReasonId = (typeof REPORT_REASONS)[number]["id"];

export function mapSafetyError(
  error: { message?: string } | null | undefined,
): string {
  const msg = error?.message ?? "";
  if (msg.includes("REPORT_RATE_LIMIT")) {
    return "You can file up to 10 reports per day. Try again tomorrow.";
  }
  if (msg.includes("Not a participant")) {
    return "You can only manage conversations you're part of.";
  }
  if (msg.trim()) return msg;
  return "Something went wrong. Please try again.";
}

export async function blockConversation(
  supabase: SupabaseClient,
  conversationId: string,
): Promise<{ data: ConversationRow | null; error: string | null }> {
  const { data, error } = await supabase.rpc("block_conversation", {
    p_conversation_id: conversationId,
  });
  if (error) return { data: null, error: mapSafetyError(error) };
  const row = (Array.isArray(data) ? data[0] : data) as ConversationRow | null;
  return { data: row, error: null };
}

export async function disconnectConversation(
  supabase: SupabaseClient,
  conversationId: string,
): Promise<{ data: ConversationRow | null; error: string | null }> {
  const { data, error } = await supabase.rpc("disconnect_conversation", {
    p_conversation_id: conversationId,
  });
  if (error) return { data: null, error: mapSafetyError(error) };
  const row = (Array.isArray(data) ? data[0] : data) as ConversationRow | null;
  return { data: row, error: null };
}

export async function reportUser(
  supabase: SupabaseClient,
  params: {
    reportedId: string;
    reason: ReportReasonId;
    details?: string;
    conversationId?: string | null;
    alsoBlock?: boolean;
  },
): Promise<{ error: string | null }> {
  const { error } = await supabase.rpc("report_user", {
    p_reported_id: params.reportedId,
    p_reason: params.reason,
    p_details: params.details?.trim() || null,
    p_conversation_id: params.conversationId ?? null,
    p_also_block: params.alsoBlock ?? true,
  });
  if (error) return { error: mapSafetyError(error) };
  return { error: null };
}
