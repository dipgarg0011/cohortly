import Link from "next/link";
import { isAdminEmail } from "@/lib/admin";
import { createClient } from "@/lib/supabase/server";

const linkClass =
  "inline-flex items-center rounded-sm py-0 text-[0.8125rem] leading-[1.45] text-slate-600 underline-offset-2 transition-[color,opacity,text-decoration-color] duration-150 hover:text-[var(--brand)] hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--background)]";

/**
 * Server-only: renders footer Moderation link when the session email is in ADMIN_EMAILS.
 * Logged-out and non-admin users see nothing.
 */
export async function FooterAdminLink() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!isAdminEmail(user?.email)) return null;

  return (
    <Link href="/admin/moderation" className={linkClass}>
      Moderation
    </Link>
  );
}
