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
  company?: string | null;
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

export type BlockedEmailRow = {
  email: string;
  reason: string | null;
  created_at: string;
};

export type AdminMemberRow = {
  id: string;
  email: string | null;
  full_name: string | null;
  batch_year: number | null;
  department: string | null;
  status: string | null;
  skills: string[] | null;
  role_title: string | null;
  company: string | null;
  is_blocked: boolean;
};

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

/** Newest blocks first. Service-role client required. */
export async function listBlockedEmails(
  service: SupabaseClient,
  limit = 200,
): Promise<{ blocked: BlockedEmailRow[]; error: string | null }> {
  const { data, error } = await service
    .from("blocked_emails")
    .select("email, reason, created_at")
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) {
    return { blocked: [], error: error.message };
  }

  return {
    blocked: (data ?? []) as BlockedEmailRow[],
    error: null,
  };
}

async function blockedSetForEmails(
  service: SupabaseClient,
  emails: string[],
): Promise<Set<string>> {
  const unique = Array.from(
    new Set(emails.map(normalizeEmail).filter((e) => e.includes("@"))),
  );
  if (unique.length === 0) return new Set();

  const { data } = await service
    .from("blocked_emails")
    .select("email")
    .in("email", unique);

  return new Set(
    ((data ?? []) as { email: string }[]).map((r) => normalizeEmail(r.email)),
  );
}

/**
 * Member lookup by name (profiles) and/or email (auth.users via RPC).
 * Never returns private message bodies.
 */
export async function searchMembersForModeration(
  service: SupabaseClient,
  query: string,
): Promise<{ members: AdminMemberRow[]; error: string | null }> {
  const q = query.trim();
  if (q.length < 2) {
    return {
      members: [],
      error: "Enter at least 2 characters to search.",
    };
  }

  const looksLikeEmail = q.includes("@") || q.includes(".");
  const memberById = new Map<string, AdminMemberRow>();

  if (looksLikeEmail) {
    const { data: emailHits, error: emailError } = await service.rpc(
      "admin_find_users_by_email",
      { p_query: q },
    );

    if (emailError) {
      const msg = emailError.message ?? "";
      if (
        msg.includes("Could not find the function") ||
        msg.includes("schema cache")
      ) {
        return {
          members: [],
          error:
            "Run migration 20260815_admin_moderation_expand.sql in Supabase SQL Editor, then retry email search.",
        };
      }
      return { members: [], error: msg };
    }

    const rows = (emailHits ?? []) as { user_id: string; email: string }[];
    if (rows.length > 0) {
      const ids = rows.map((r) => r.user_id);
      const { data: profiles } = await service
        .from("profiles")
        .select(
          "id, full_name, batch_year, department, status, skills, role_title, company",
        )
        .in("id", ids);

      const profileById = new Map(
        ((profiles ?? []) as ProfileSnippet[]).map((p) => [p.id, p]),
      );

      for (const row of rows) {
        const profile = profileById.get(row.user_id);
        memberById.set(row.user_id, {
          id: row.user_id,
          email: normalizeEmail(row.email),
          full_name: profile?.full_name ?? null,
          batch_year: profile?.batch_year ?? null,
          department: profile?.department ?? null,
          status: profile?.status ?? null,
          skills: profile?.skills ?? null,
          role_title: profile?.role_title ?? null,
          company: profile?.company ?? null,
          is_blocked: false,
        });
      }
    }
  }

  const { data: nameHits, error: nameError } = await service
    .from("profiles")
    .select(
      "id, full_name, batch_year, department, status, skills, role_title, company",
    )
    .ilike("full_name", `%${q}%`)
    .limit(20);

  if (nameError) {
    return { members: [], error: nameError.message };
  }

  const nameProfiles = (nameHits ?? []) as ProfileSnippet[];

  if (nameProfiles.length > 0) {
    const missingIds = nameProfiles
      .map((p) => p.id)
      .filter((id) => !memberById.has(id));
    const emailMap = await emailsForIds(service, missingIds);

    for (const profile of nameProfiles) {
      const existing = memberById.get(profile.id);
      if (existing) {
        existing.full_name = profile.full_name;
        existing.batch_year = profile.batch_year;
        existing.department = profile.department;
        existing.status = profile.status;
        existing.skills = profile.skills;
        existing.role_title = profile.role_title;
        existing.company = profile.company ?? null;
        continue;
      }
      memberById.set(profile.id, {
        id: profile.id,
        email: emailMap.get(profile.id) ?? null,
        full_name: profile.full_name,
        batch_year: profile.batch_year,
        department: profile.department,
        status: profile.status,
        skills: profile.skills,
        role_title: profile.role_title,
        company: profile.company ?? null,
        is_blocked: false,
      });
    }
  }

  const members = Array.from(memberById.values());
  const blocked = await blockedSetForEmails(
    service,
    members.map((m) => m.email).filter((e): e is string => Boolean(e)),
  );

  for (const m of members) {
    if (m.email && blocked.has(normalizeEmail(m.email))) {
      m.is_blocked = true;
    }
  }

  members.sort((a, b) =>
    (a.full_name ?? a.email ?? "").localeCompare(b.full_name ?? b.email ?? ""),
  );

  return { members, error: null };
}

export async function logAdminAction(
  service: SupabaseClient,
  entry: {
    admin_email: string;
    action:
      | "block_email"
      | "unblock_email"
      | "remove_user"
      | "mark_reviewed";
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
