import { notFound } from "next/navigation";
import { normalizeEmail } from "@/lib/college";
import { requireProfile } from "@/lib/require-profile";

/**
 * Server-only admin allowlist (comma-separated, lowercase).
 * Set ADMIN_EMAILS in Vercel / .env.local — never NEXT_PUBLIC_*.
 */
export function getAdminEmails(): ReadonlySet<string> {
  const raw = process.env.ADMIN_EMAILS?.trim();
  if (!raw) return new Set();

  return new Set(
    raw
      .split(",")
      .map((entry) => entry.trim().toLowerCase())
      .filter(Boolean),
  );
}

export function isAdminEmail(email: string | null | undefined): boolean {
  if (!email) return false;
  return getAdminEmails().has(normalizeEmail(email));
}

/** Require logged-in profile whose email is in ADMIN_EMAILS. Non-admins get 404. */
export async function requireAdmin() {
  const { supabase, user } = await requireProfile();
  if (!isAdminEmail(user.email)) {
    notFound();
  }
  return { supabase, user };
}
