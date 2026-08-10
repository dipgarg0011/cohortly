export type PushPayload = {
  type?: string;
  notification_type?: string;
  partner_id?: string;
  conversation_id?: string;
  request_id?: string;
  answer_id?: string;
  match_id?: string;
  opportunity_id?: string;
  application_id?: string;
  link?: string;
  [key: string]: unknown;
};

function firstString(...values: unknown[]): string | null {
  for (const v of values) {
    if (typeof v === "string" && v.trim()) return v.trim();
  }
  return null;
}

/**
 * Map notification payload / link → web app destination.
 * Mirrors mobile `hrefFromPushPayload` with web routes + actionable tabs.
 */
export function hrefFromNotificationPayload(
  data: PushPayload | null | undefined,
): string | null {
  if (!data || typeof data !== "object") return null;

  const type = String(data.type ?? data.notification_type ?? "");
  const partnerId = firstString(data.partner_id);
  const requestId = firstString(data.request_id);
  const applicationId = firstString(data.application_id);
  const opportunityId = firstString(data.opportunity_id);

  if (
    type === "message" ||
    type === "connection" ||
    type === "connection_request" ||
    type === "connection_accepted"
  ) {
    if (partnerId) return `/messages?with=${encodeURIComponent(partnerId)}`;
    return "/messages";
  }

  if (type === "mentor" || type.startsWith("mentorship")) {
    const tab =
      type === "mentorship_match" ||
      type === "mentorship_watch_match" ||
      type === "mentorship_auto_withdraw"
        ? "inbox"
        : "mine";
    const qs = new URLSearchParams({ tab });
    if (requestId) qs.set("requestId", requestId);
    return `/mentors?${qs.toString()}`;
  }

  if (type === "referral" || type.startsWith("referral")) {
    const tab =
      type === "referral_match" || type === "referral_nudge"
        ? "help"
        : "need";
    const qs = new URLSearchParams({ tab });
    if (requestId) qs.set("requestId", requestId);
    return `/referrals?${qs.toString()}`;
  }

  if (type === "opportunity" || type.startsWith("opportunity")) {
    const view =
      type === "opportunity_application"
        ? "applicants"
        : type === "opportunity_application_accepted" ||
            type === "opportunity_application_reviewing" ||
            type === "opportunity_application_declined" ||
            type === "opportunity_application_shortlisted"
          ? "mine"
          : "board";
    const qs = new URLSearchParams({ view });
    if (applicationId) qs.set("applicationId", applicationId);
    if (opportunityId) qs.set("opportunityId", opportunityId);
    return `/opportunities?${qs.toString()}`;
  }

  const link = typeof data.link === "string" ? data.link : "";
  if (link.startsWith("/")) {
    if (
      link.startsWith("/messages") ||
      link.startsWith("/mentors") ||
      link.startsWith("/referrals") ||
      link.startsWith("/opportunities") ||
      link.startsWith("/network") ||
      link.startsWith("/dashboard") ||
      link.startsWith("/profile") ||
      link.startsWith("/notifications")
    ) {
      // Enrich bare /opportunities links from payload when possible
      if (link === "/opportunities" || link.startsWith("/opportunities?")) {
        if (!link.includes("view=") && (applicationId || type.startsWith("opportunity"))) {
          const enriched = hrefFromNotificationPayload({
            ...data,
            link: undefined,
            type: type || "opportunity_application",
          });
          if (enriched) return enriched;
        }
      }
      return link;
    }
  }

  return null;
}
