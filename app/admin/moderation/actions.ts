"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/admin";
import {
  listRecentMembersForModeration,
  logAdminAction,
  searchMembersForModeration,
  type AdminMemberRow,
} from "@/lib/admin-moderation";
import { normalizeEmail } from "@/lib/college";
import {
  createServiceClient,
  hasServiceRoleKey,
} from "@/lib/supabase/service";

export type ModerationActionResult =
  | { ok: true }
  | { ok: false; error: string };

function serviceOrError():
  | { ok: true; service: ReturnType<typeof createServiceClient> }
  | { ok: false; error: string } {
  if (!hasServiceRoleKey()) {
    return {
      ok: false,
      error:
        "SUPABASE_SERVICE_ROLE_KEY is not set on the server. Add it in Vercel / .env.local (never NEXT_PUBLIC_).",
    };
  }
  try {
    return { ok: true, service: createServiceClient() };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "Could not create service client.",
    };
  }
}

function revalidateModeration() {
  revalidatePath("/admin/moderation");
}

export async function blockReportedEmail(input: {
  email: string;
  reason?: string;
  reportId?: string;
  targetUserId?: string;
}): Promise<ModerationActionResult> {
  const { user } = await requireAdmin();
  const svc = serviceOrError();
  if (!svc.ok) return svc;

  const email = normalizeEmail(input.email);
  if (!email.includes("@")) {
    return { ok: false, error: "Invalid email." };
  }

  if (user.email && normalizeEmail(user.email) === email) {
    return { ok: false, error: "You cannot block your own email." };
  }

  const reason =
    input.reason?.trim() ||
    "Blocked via admin moderation console";

  const { error } = await svc.service.from("blocked_emails").upsert(
    { email, reason },
    { onConflict: "email" },
  );

  if (error) {
    return { ok: false, error: error.message };
  }

  await logAdminAction(svc.service, {
    admin_email: user.email ?? "",
    action: "block_email",
    target_user_id: input.targetUserId ?? null,
    target_email: email,
    report_id: input.reportId ?? null,
    detail: reason,
  });

  revalidateModeration();
  return { ok: true };
}

export async function unblockEmail(input: {
  email: string;
}): Promise<ModerationActionResult> {
  const { user } = await requireAdmin();
  const svc = serviceOrError();
  if (!svc.ok) return svc;

  const email = normalizeEmail(input.email);
  if (!email.includes("@")) {
    return { ok: false, error: "Invalid email." };
  }

  const { error } = await svc.service
    .from("blocked_emails")
    .delete()
    .eq("email", email);

  if (error) {
    return { ok: false, error: error.message };
  }

  await logAdminAction(svc.service, {
    admin_email: user.email ?? "",
    action: "unblock_email",
    target_email: email,
    detail: "Unblocked via admin moderation console",
  });

  revalidateModeration();
  return { ok: true };
}

export async function removeReportedUser(input: {
  userId: string;
  reason?: string;
  reportId?: string;
}): Promise<ModerationActionResult> {
  const { user } = await requireAdmin();
  const svc = serviceOrError();
  if (!svc.ok) return svc;

  if (!input.userId) {
    return { ok: false, error: "User id required." };
  }

  if (user.id === input.userId) {
    return { ok: false, error: "You cannot remove your own account from here." };
  }

  const reason =
    input.reason?.trim() || "Removed via admin moderation console";

  const { data: authUser } = await svc.service.auth.admin.getUserById(
    input.userId,
  );
  const targetEmail = authUser.user?.email
    ? normalizeEmail(authUser.user.email)
    : null;

  const { error } = await svc.service.rpc("admin_remove_user", {
    p_user_id: input.userId,
    p_reason: reason,
  });

  if (error) {
    const msg = error.message ?? "";
    if (msg.includes("Could not find the function") || msg.includes("schema cache")) {
      return {
        ok: false,
        error:
          "Run migration 20260814_admin_moderation.sql in Supabase SQL Editor, then retry.",
      };
    }
    return { ok: false, error: msg || "Remove failed." };
  }

  await logAdminAction(svc.service, {
    admin_email: user.email ?? "",
    action: "remove_user",
    target_user_id: input.userId,
    target_email: targetEmail,
    report_id: input.reportId ?? null,
    detail: reason,
  });

  revalidateModeration();
  return { ok: true };
}

export async function markReportReviewed(input: {
  reportId: string;
}): Promise<ModerationActionResult> {
  const { user } = await requireAdmin();
  const svc = serviceOrError();
  if (!svc.ok) return svc;

  if (!input.reportId) {
    return { ok: false, error: "Report id required." };
  }

  const { error } = await svc.service
    .from("user_reports")
    .update({ reviewed_at: new Date().toISOString() })
    .eq("id", input.reportId);

  if (error) {
    const msg = error.message ?? "";
    if (msg.includes("reviewed_at")) {
      return {
        ok: false,
        error:
          "Run migration 20260814_admin_moderation.sql in Supabase SQL Editor, then retry.",
      };
    }
    return { ok: false, error: msg };
  }

  await logAdminAction(svc.service, {
    admin_email: user.email ?? "",
    action: "mark_reviewed",
    report_id: input.reportId,
  });

  revalidateModeration();
  return { ok: true };
}

export async function searchModerationMembers(input: {
  query: string;
}): Promise<
  | { ok: true; members: AdminMemberRow[]; warning?: string }
  | { ok: false; error: string }
> {
  await requireAdmin();
  const svc = serviceOrError();
  if (!svc.ok) return svc;

  try {
    const result = await searchMembersForModeration(svc.service, input.query);
    if (result.error && result.members.length === 0) {
      return { ok: false, error: result.error };
    }
    return {
      ok: true,
      members: result.members,
      warning: result.error ?? undefined,
    };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "Search failed.",
    };
  }
}

export async function loadRecentModerationMembers(): Promise<
  | { ok: true; members: AdminMemberRow[]; warning?: string }
  | { ok: false; error: string }
> {
  await requireAdmin();
  const svc = serviceOrError();
  if (!svc.ok) return svc;

  try {
    const result = await listRecentMembersForModeration(svc.service, 20);
    if (result.error && result.members.length === 0) {
      return { ok: false, error: result.error };
    }
    return {
      ok: true,
      members: result.members,
      warning: result.error ?? undefined,
    };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "Failed to load recent members.",
    };
  }
}
