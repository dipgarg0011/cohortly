import type { SupabaseClient } from "@supabase/supabase-js";
import { normalizeEmail } from "@/lib/college";
import { REPORT_REASONS, type ReportReasonId } from "@/lib/safety";

export type AdminReportRow = {
  id: string;
  reason: ReportReasonId | string;
  details: string | null;
  created_at: string;
  reviewed_at: string | null;
  conversation_id: string | null;
  reporter_id: string;
  reported_id: string;
  reporter_name: string | null;
  reporter_email: string | null;
  reported_name: string | null;
  reported_email: string | null;
  reported_batch_year: number | null;
  reported_department: string | null;
  reported_status: string | null;
  reported_skills: string[] | null;
  reported_role_title: string | null;
};

type ProfileSnippet = {
  id: string;
  full_name: string | null;
  batch_year: number | null;
  department: string | null;
  status: string | null;
  skills: string[] | null;
  role_title: string | null;
};

type RawReport = {
  id: string;
  reason: string;
  details: string | null;
  created_at: string;
  reviewed_at?: string | null;
  conversation_id: string | null;
  reporter_id: string;
  reported_id: string;
};

export function reasonLabel(reason: string): string {
  const found = REPORT_REASONS.find((r) => r.id === reason);
  return found?.label ?? reason;
}

async function emailsForIds(
  service: SupabaseClient,
  ids: string[],
): Promise<Map<string, string | null>> {
  const map = new Map<string, string | null>();
  await Promise.all(
    ids.map(async (id) => {
      const { data, error } = await service.auth.admin.getUserById(id);
      if (error || !data.user) {
        map.set(id, null);
        return;
      }
      map.set(id, data.user.email ? normalizeEmail(data.user.email) : null);
    }),
  );
  return map;
}

async function enrichReports(
  service: SupabaseClient,
  list: RawReport[],
): Promise<AdminReportRow[]> {
  if (list.length === 0) return [];

  const profileIds = Array.from(
    new Set(list.flatMap((r) => [r.reporter_id, r.reported_id])),
  );

  const [{ data: profiles }, emailMap] = await Promise.all([
    service
      .from("profiles")
      .select("id, full_name, batch_year, department, status, skills, role_title")
      .in("id", profileIds),
    emailsForIds(service, profileIds),
  ]);

  const byId = new Map<string, ProfileSnippet>();
  for (const p of (profiles ?? []) as ProfileSnippet[]) {
    byId.set(p.id, p);
  }

  return list.map((r) => {
    const reporter = byId.get(r.reporter_id);
    const reported = byId.get(r.reported_id);
    return {
      id: r.id,
      reason: r.reason,
      details: r.details,
      created_at: r.created_at,
      reviewed_at: r.reviewed_at ?? null,
      conversation_id: r.conversation_id,
      reporter_id: r.reporter_id,
      reported_id: r.reported_id,
      reporter_name: reporter?.full_name ?? null,
      reporter_email: emailMap.get(r.reporter_id) ?? null,
      reported_name: reported?.full_name ?? null,
      reported_email: emailMap.get(r.reported_id) ?? null,
      reported_batch_year: reported?.batch_year ?? null,
      reported_department: reported?.department ?? null,
      reported_status: reported?.status ?? null,
      reported_skills: reported?.skills ?? null,
      reported_role_title: reported?.role_title ?? null,
    };
  });
}

/** Newest reports first. Service-role client required (RLS blocks authenticated list). */
export async function listModerationReports(
  service: SupabaseClient,
  limit = 100,
): Promise<{ reports: AdminReportRow[]; error: string | null }> {
  const withReviewed = await service
    .from("user_reports")
    .select(
      "id, reason, details, created_at, reviewed_at, conversation_id, reporter_id, reported_id",
    )
    .order("created_at", { ascending: false })
    .limit(limit);

  let rows = withReviewed.data as RawReport[] | null;
  let warning: string | null = null;

  if (withReviewed.error) {
    const msg = withReviewed.error.message ?? "";
    if (!msg.includes("reviewed_at")) {
      return { reports: [], error: msg };
    }

    const fallback = await service
      .from("user_reports")
      .select(
        "id, reason, details, created_at, conversation_id, reporter_id, reported_id",
      )
      .order("created_at", { ascending: false })
      .limit(limit);

    if (fallback.error) {
      return { reports: [], error: fallback.error.message };
    }

    rows = (fallback.data as RawReport[] | null)?.map((r) => ({
      ...r,
      reviewed_at: null,
    })) ?? [];
    warning =
      "Apply migration 20260814_admin_moderation.sql for reviewed_at, action log, and admin_remove_user.";
  }

  const reports = await enrichReports(service, rows ?? []);
  return { reports, error: warning };
}

export async function logAdminAction(
  service: SupabaseClient,
  entry: {
    admin_email: string;
    action: "block_email" | "remove_user" | "mark_reviewed";
    target_user_id?: string | null;
    target_email?: string | null;
    report_id?: string | null;
    detail?: string | null;
  },
): Promise<void> {
  const { error } = await service.from("admin_moderation_log").insert({
    admin_email: normalizeEmail(entry.admin_email),
    action: entry.action,
    target_user_id: entry.target_user_id ?? null,
    target_email: entry.target_email
      ? normalizeEmail(entry.target_email)
      : null,
    report_id: entry.report_id ?? null,
    detail: entry.detail ?? null,
  });
  if (error) {
    console.error("admin_moderation_log insert failed:", error.message);
  }
}
