import type { SupabaseClient } from "@supabase/supabase-js";
import { BLOCKED_EMAIL_ERROR, normalizeEmail } from "@/lib/college";

/**
 * True when email is listed in public.blocked_emails (via is_email_blocked RPC).
 * Fail-open if the RPC is missing so auth is not bricked before migration apply.
 */
export async function isEmailBlocked(
  supabase: SupabaseClient,
  email: string | null | undefined,
): Promise<boolean> {
  if (!email) return false;

  const { data, error } = await supabase.rpc("is_email_blocked", {
    check_email: normalizeEmail(email),
  });

  if (error) {
    console.error("is_email_blocked RPC failed:", error.message);
    return false;
  }

  return data === true;
}

export async function assertNotBlockedEmail(
  supabase: SupabaseClient,
  email: string | null | undefined,
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (await isEmailBlocked(supabase, email)) {
    return { ok: false, error: BLOCKED_EMAIL_ERROR };
  }
  return { ok: true };
}
