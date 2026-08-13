import { notFound } from "next/navigation";
import { normalizeEmail } from "@/lib/college";
import { requireProfile } from "@/lib/require-profile";

/**
 * Server-only admin allowlist (comma-separated, lowercase).
 * Set ADMIN_EMAILS in Vercel / .env.local — never NEXT_PUBLIC_*.
 * Read at request time (Node server / RSC); not used in Edge proxy.
 */
function parseAdminEmailAllowlist(raw: string | undefined): ReadonlySet<string> {
  if (!raw) return new Set();

  // Strip BOM / wrapping quotes that Vercel paste sometimes includes.
  const cleaned = raw.replace(/^\uFEFF/, "").trim();
  if (!cleaned) return new Set();

  return new Set(
    cleaned
      .split(/[,;\n]+/)
      .map((entry) =>
        entry
          .trim()
          .replace(/^["']+|["']+$/g, "")
          .toLowerCase(),
      )
      .filter(Boolean),
  );
}

export function getAdminEmails(): ReadonlySet<string> {
  // Bracket access avoids any accidental build-time static replacement.
  return parseAdminEmailAllowlist(process.env["ADMIN_EMAILS"]);
}

export function isAdminEmail(email: string | null | undefined): boolean {
  if (!email) return false;
  return getAdminEmails().has(normalizeEmail(email));
}

/** Require logged-in profile whose email is in ADMIN_EMAILS. Non-admins get 404. */
export async function requireAdmin() {
  const { supabase, user } = await requireProfile();
  const allowlist = getAdminEmails();
  if (allowlist.size === 0) {
    console.warn(
      "[admin] ADMIN_EMAILS is empty or unset — moderation stays locked (404).",
    );
  }
  if (!isAdminEmail(user.email)) {
    notFound();
  }
  return { supabase, user };
}
