import type {
  ContextSnapshot,
  ContextType,
  ConversationRow,
  UnlockReason,
} from "@/lib/conversations";
import {
  conversationContextLabel,
  resolveContextType,
} from "@/lib/conversations";
import { firstName } from "@/lib/network";
import { APPLICATION_STATUS_LABEL } from "@/lib/opportunities";
import { referralStatusLabel, type ReferralStatus } from "@/lib/referrals";

export type ViewerContextRole =
  | "requester"
  | "helper"
  | "student"
  | "mentor"
  | "applicant"
  | "poster";

export type ContextNextAction = {
  label: string;
  kind: "mark_submitted" | "shortlist" | "start_reviewing";
  sourceId: string;
};

/** Enriched per-thread context for the pinned header + openers. */
export type ThreadContext = {
  conversationId: string;
  contextType: Exclude<ContextType, "connection">;
  contextId: string | null;
  snapshot: ContextSnapshot;
  sourceActive: boolean;
  viewerRole: ViewerContextRole;
  /** Partner name for role-framed copy; null when anonymity hides it. */
  partnerName: string | null;
  partnerNameHidden: boolean;
  company: string | null;
  role: string | null;
  title: string | null;
  stage: string | null;
  stageLabel: string | null;
  description: string | null;
  answerContent: string | null;
  pitch: string | null;
  linkHref: string | null;
  linkLabel: string | null;
  nextAction: ContextNextAction | null;
};

export function snapshotFromUnknown(
  value: unknown,
): ContextSnapshot {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const o = value as Record<string, unknown>;
  return {
    title: typeof o.title === "string" ? o.title : null,
    company: typeof o.company === "string" ? o.company : null,
    role: typeof o.role === "string" ? o.role : null,
    category: typeof o.category === "string" ? o.category : null,
    type: typeof o.type === "string" ? o.type : null,
    description: typeof o.description === "string" ? o.description : null,
    pitch: typeof o.pitch === "string" ? o.pitch : null,
    request_id: typeof o.request_id === "string" ? o.request_id : null,
    question_id: typeof o.question_id === "string" ? o.question_id : null,
    opportunity_id: typeof o.opportunity_id === "string" ? o.opportunity_id : null,
    application_id:
      typeof o.application_id === "string" ? o.application_id : null,
    student_id: typeof o.student_id === "string" ? o.student_id : null,
    is_anonymous: typeof o.is_anonymous === "boolean" ? o.is_anonymous : null,
  };
}

export function listLabelForConversation(
  conv: ConversationRow,
): string | null {
  const type = resolveContextType(conv);
  if (!type || type === "connection") return null;
  const snap = snapshotFromUnknown(conv.context_snapshot);
  const detail =
    type === "referral" || type === "referral_question"
      ? snap.company || snap.role || snap.title
      : type === "opportunity"
        ? snap.company || snap.role || snap.title
        : snap.title || snap.company;
  return conversationContextLabel(
    (conv.unlock_reason as UnlockReason | null) ??
      (type === "opportunity" ? "opportunity_application" : type),
    detail,
  );
}

export function roleFramedHeadline(ctx: ThreadContext): string {
  const name = ctx.partnerNameHidden
    ? "a student"
    : ctx.partnerName
      ? firstName(ctx.partnerName)
      : "them";
  const company = ctx.company?.trim();
  const atCompany = company ? ` at ${company}` : "";
  const topic = (ctx.title || ctx.role || "this").trim();

  switch (ctx.contextType) {
    case "referral":
    case "referral_question":
      if (ctx.viewerRole === "helper") {
        return `You're helping ${name} with a referral${atCompany}`;
      }
      return `You asked ${name} for a referral${atCompany}`;
    case "mentorship":
      if (ctx.viewerRole === "mentor") {
        return ctx.partnerNameHidden
          ? `A student asked about ${topic}`
          : `${firstName(ctx.partnerName)} asked about ${topic}`;
      }
      return `You asked about ${topic}`;
    case "opportunity":
      if (ctx.viewerRole === "poster") {
        return `${name} applied for ${topic}${atCompany}`;
      }
      return `You applied for ${topic}${atCompany}`;
    default:
      return topic;
  }
}

export function suggestedOpeners(ctx: ThreadContext): string[] {
  const company = ctx.company?.trim();
  const role = (ctx.role || ctx.title || "").trim();

  switch (ctx.contextType) {
    case "referral":
    case "referral_question":
      if (ctx.viewerRole === "helper") {
        return [
          company
            ? `Happy to help with ${company} — can you share the JD and deadline?`
            : "Happy to help — can you share the JD and any deadline?",
          "Got it. Any specific team or location I should keep in mind?",
          "I'll take a look — anything else that would make the referral stronger?",
        ];
      }
      return [
        company
          ? `Thanks for helping with ${company} — here's the role and my resume.`
          : "Thanks for helping — here's the role and my resume.",
        "Appreciate you taking this on. Happy to answer any questions.",
        role
          ? `I'm targeting ${role}${company ? ` at ${company}` : ""}. What would be most useful from me?`
          : "What would be most useful from me to make this easy?",
      ];
    case "mentorship":
      if (ctx.viewerRole === "mentor") {
        return [
          "Happy to dig deeper — what's the most useful next step for you?",
          "Glad the answer helped. Want to walk through a concrete example?",
          "What part still feels unclear?",
        ];
      }
      return [
        "Thanks for the answer — I wanted to follow up on one detail.",
        "That was helpful. Could you expand on how you'd approach this?",
        "Appreciate it. What's one thing I should practice this week?",
      ];
    case "opportunity":
      if (ctx.viewerRole === "poster") {
        return [
          role
            ? `Thanks for applying to ${role} — I'd love to learn more about your background.`
            : "Thanks for applying — I'd love to learn more about your background.",
          "Can you share a recent project that fits this role?",
          "Happy to chat — what's your timeline?",
        ];
      }
      return [
        "Thanks for reviewing my application — happy to share more.",
        "I'd love to walk through why I'm a fit if helpful.",
        "Happy to answer any questions about my experience.",
      ];
    default:
      return [];
  }
}

export function storageKeyForContextCollapse(conversationId: string): string {
  return `cohortly:ctx-collapsed:${conversationId}`;
}

export function referralStageLabel(status: string | null | undefined): string {
  if (!status) return "Unknown";
  return referralStatusLabel(status as ReferralStatus);
}

export function opportunityStageLabel(status: string | null | undefined): string {
  if (!status) return "Unknown";
  return (
    APPLICATION_STATUS_LABEL[status as keyof typeof APPLICATION_STATUS_LABEL] ??
    status
  );
}

export function isSourceInactiveStatus(
  contextType: ContextType,
  status: string | null | undefined,
): boolean {
  if (!status) return true;
  if (contextType === "referral" || contextType === "referral_question") {
    return status === "closed" || status === "expired";
  }
  if (contextType === "mentorship") {
    return status === "closed" || status === "expired" || status === "cancelled";
  }
  if (contextType === "opportunity") {
    return status === "closed" || status === "withdrawn" || status === "declined";
  }
  return false;
}
