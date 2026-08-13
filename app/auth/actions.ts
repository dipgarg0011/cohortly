"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { assertNotBlockedEmail } from "@/lib/blocked-email";
import {
  COLLEGE_EMAIL_ERROR,
  isCollegeEmail,
  normalizeEmail,
} from "@/lib/college";

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/auth");
}

/**
 * Server-side signup/login gate: college domain + blocked_emails RPC.
 * Keeps block-list checks off the client bundle / direct table access.
 */
export async function assertAllowedAuthEmail(
  email: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const normalized = normalizeEmail(email);

  if (!isCollegeEmail(normalized)) {
    return { ok: false, error: COLLEGE_EMAIL_ERROR };
  }

  const supabase = await createClient();
  return assertNotBlockedEmail(supabase, normalized);
}
