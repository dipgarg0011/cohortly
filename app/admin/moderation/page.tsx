import Link from "next/link";
import { requireAdmin } from "@/lib/admin";
import {
  listBlockedEmails,
  listModerationReports,
} from "@/lib/admin-moderation";
import {
  createServiceClient,
  hasServiceRoleKey,
} from "@/lib/supabase/service";
import { AdminModerationConsole } from "@/components/admin-moderation-console";
import { Navbar } from "@/components/navbar";
import { PageShell, PageHeader } from "@/components/ui/page-shell";

/** Always evaluate ADMIN_EMAILS / session at request time. */
export const dynamic = "force-dynamic";

export default async function AdminModerationPage() {
  await requireAdmin();

  const serviceConfigured = hasServiceRoleKey();
  let reports: Awaited<ReturnType<typeof listModerationReports>>["reports"] =
    [];
  let blocked: Awaited<ReturnType<typeof listBlockedEmails>>["blocked"] = [];
  let loadError: string | null = null;

  if (serviceConfigured) {
    try {
      const service = createServiceClient();
      const [reportResult, blockedResult] = await Promise.all([
        listModerationReports(service),
        listBlockedEmails(service),
      ]);
      reports = reportResult.reports;
      blocked = blockedResult.blocked;
      loadError = reportResult.error ?? blockedResult.error;
    } catch (e) {
      loadError =
        e instanceof Error ? e.message : "Failed to load moderation data.";
    }
  }

  return (
    <PageShell accent="profile">
      <Navbar />
      <main className="relative z-10 mx-auto w-full min-w-0 max-w-3xl flex-1 overflow-x-clip px-4 py-6 sm:px-6 sm:py-10">
        <PageHeader
          accent="profile"
          eyebrow="Admin"
          title="Safety console"
          description="Review reports, manage blocked emails, and look up members. Private chat messages are never shown here."
        />
        <p className="mb-4 text-sm">
          <Link
            href="/profile"
            className="font-semibold text-[var(--brand)] hover:underline"
          >
            ← Back to profile
          </Link>
        </p>
        <AdminModerationConsole
          reports={reports}
          blocked={blocked}
          loadError={loadError}
          serviceConfigured={serviceConfigured}
        />
      </main>
    </PageShell>
  );
}
