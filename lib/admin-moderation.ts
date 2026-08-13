import type { SupabaseClient } from "@supabase/supabase-js";
import { companySearchMatch } from "@/lib/company-search";
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

const PROFILE_MEMBER_SELECT =
  "id, full_name, batch_year, department, status, skills, role_title, company";

const MIGRATION_20260815_HINT =
  "Run migration 20260815_admin_moderation_expand.sql in Supabase SQL Editor for faster email/recent lookups.";

function isMissingRpcError(message: string): boolean {
  return (
    message.includes("Could not find the function") ||
    message.includes("schema cache") ||
    message.includes("does not exist")
  );
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

async function applyBlockedFlags(
  service: SupabaseClient,
  members: AdminMemberRow[],
): Promise<AdminMemberRow[]> {
  const blocked = await blockedSetForEmails(
    service,
    members.map((m) => m.email).filter((e): e is string => Boolean(e)),
  );
  for (const m of members) {
    m.is_blocked = Boolean(m.email && blocked.has(normalizeEmail(m.email)));
  }
  return members;
}

async function profilesByIds(
  service: SupabaseClient,
  ids: string[],
): Promise<Map<string, ProfileSnippet>> {
  if (ids.length === 0) return new Map();
  const { data } = await service
    .from("profiles")
    .select(PROFILE_MEMBER_SELECT)
    .in("id", ids);
  return new Map(
    ((data ?? []) as ProfileSnippet[]).map((p) => [p.id, p]),
  );
}

/** Auth Admin API fallback when SQL helpers are not installed yet. */
async function listAuthUsersFallback(
  service: SupabaseClient,
  options: { emailQuery?: string; recentLimit?: number },
): Promise<{ user_id: string; email: string }[]> {
  const needle = options.emailQuery?.trim().toLowerCase() ?? "";
  const recentLimit = options.recentLimit ?? 0;
  const collected: { user_id: string; email: string; created_at: string }[] =
    [];

  for (let page = 1; page <= 10; page += 1) {
    const { data, error } = await service.auth.admin.listUsers({
      page,
      perPage: 200,
    });
    if (error || !data?.users?.length) break;

    for (const user of data.users) {
      if (!user.email) continue;
      const email = normalizeEmail(user.email);
      if (needle && !email.includes(needle)) continue;
      collected.push({
        user_id: user.id,
        email,
        created_at: user.created_at ?? "",
      });
    }

    if (data.users.length < 200) break;
  }

  if (recentLimit > 0 && !needle) {
    collected.sort((a, b) => b.created_at.localeCompare(a.created_at));
    return collected.slice(0, recentLimit).map(({ user_id, email }) => ({
      user_id,
      email,
    }));
  }

  return collected.slice(0, 20).map(({ user_id, email }) => ({
    user_id,
    email,
  }));
}

async function findUsersByEmail(
  service: SupabaseClient,
  query: string,
): Promise<{
  hits: { user_id: string; email: string }[];
  warning: string | null;
  error: string | null;
}> {
  const { data, error } = await service.rpc("admin_find_users_by_email", {
    p_query: query,
  });

  if (!error) {
    const hits = ((data ?? []) as { user_id: string; email: string }[]).map(
      (row) => ({
        user_id: row.user_id,
        email: normalizeEmail(row.email),
      }),
    );
    return { hits, warning: null, error: null };
  }

  const msg = error.message ?? "";
  if (isMissingRpcError(msg)) {
    const hits = await listAuthUsersFallback(service, { emailQuery: query });
    return { hits, warning: MIGRATION_20260815_HINT, error: null };
  }

  return { hits: [], warning: null, error: msg };
}

async function membersFromAuthHits(
  service: SupabaseClient,
  hits: { user_id: string; email: string }[],
): Promise<AdminMemberRow[]> {
  if (hits.length === 0) return [];
  const profileById = await profilesByIds(
    service,
    hits.map((h) => h.user_id),
  );

  return hits.map((hit) => {
    const profile = profileById.get(hit.user_id);
    return {
      id: hit.user_id,
      email: hit.email,
      full_name: profile?.full_name ?? null,
      batch_year: profile?.batch_year ?? null,
      department: profile?.department ?? null,
      status: profile?.status ?? null,
      skills: profile?.skills ?? null,
      role_title: profile?.role_title ?? null,
      company: profile?.company ?? null,
      is_blocked: false,
    };
  });
}

/**
 * Newest signups (auth.users). Falls back to Auth Admin listUsers if RPC missing.
 * Never returns private message bodies.
 */
export async function listRecentMembersForModeration(
  service: SupabaseClient,
  limit = 20,
): Promise<{ members: AdminMemberRow[]; error: string | null }> {
  const capped = Math.max(1, Math.min(limit, 50));
  let hits: { user_id: string; email: string }[] = [];
  let warning: string | null = null;

  const { data, error } = await service.rpc("admin_list_recent_users", {
    p_limit: capped,
  });

  if (!error) {
    hits = ((data ?? []) as { user_id: string; email: string }[]).map(
      (row) => ({
        user_id: row.user_id,
        email: normalizeEmail(row.email),
      }),
    );
  } else {
    const msg = error.message ?? "";
    if (!isMissingRpcError(msg)) {
      return { members: [], error: msg };
    }
    hits = await listAuthUsersFallback(service, { recentLimit: capped });
    warning = MIGRATION_20260815_HINT;
  }

  const members = await applyBlockedFlags(
    service,
    await membersFromAuthHits(service, hits),
  );
  return { members, error: warning };
}

/**
 * Member lookup by name (profiles ilike) AND email (auth.users via RPC / Admin API).
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

  const memberById = new Map<string, AdminMemberRow>();
  let warning: string | null = null;

  const emailResult = await findUsersByEmail(service, q);
  if (emailResult.error) {
    return { members: [], error: emailResult.error };
  }
  if (emailResult.warning) warning = emailResult.warning;

  for (const member of await membersFromAuthHits(service, emailResult.hits)) {
    memberById.set(member.id, member);
  }

  const [{ data: nameHits, error: nameError }, { data: companyRows, error: companyError }] =
    await Promise.all([
      service
        .from("profiles")
        .select(PROFILE_MEMBER_SELECT)
        .ilike("full_name", `%${q}%`)
        .limit(20),
      // College-scale: load companies and match punctuation-insensitively in JS.
      service
        .from("profiles")
        .select(PROFILE_MEMBER_SELECT)
        .not("company", "is", null)
        .neq("company", "")
        .limit(500),
    ]);

  if (nameError) {
    return { members: [], error: nameError.message };
  }
  if (companyError && !warning) {
    warning = companyError.message;
  }

  const nameProfiles = (nameHits ?? []) as ProfileSnippet[];
  const companyProfiles = ((companyRows ?? []) as ProfileSnippet[]).filter(
    (p) => companySearchMatch(q, p.company),
  );
  const profileHits = [...nameProfiles, ...companyProfiles];

  if (profileHits.length > 0) {
    const missingIds = [
      ...new Set(
        profileHits.map((p) => p.id).filter((id) => !memberById.has(id)),
      ),
    ];
    const emailMap = await emailsForIds(service, missingIds);

    for (const profile of profileHits) {
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

  const members = await applyBlockedFlags(
    service,
    Array.from(memberById.values()),
  );

  members.sort((a, b) =>
    (a.full_name ?? a.email ?? "").localeCompare(b.full_name ?? b.email ?? ""),
  );

  return { members, error: warning };
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
