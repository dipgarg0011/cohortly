import { requireProfile } from "@/lib/require-profile";
import { Navbar } from "@/components/navbar";
import { NetworkDirectory } from "@/components/network-directory";
import { PageShell, PageHeader } from "@/components/ui/page-shell";
import type { ConversationRow } from "@/lib/conversations";
import type { NetworkProfile, ProfileRole } from "@/lib/network";

type SearchParams = Promise<{
  batch?: string;
  dept?: string;
  status?: string;
}>;

function parseInitialFilters(params: {
  batch?: string;
  dept?: string;
  status?: string;
}): {
  batchYear: string;
  department: string;
  status: "All" | ProfileRole;
} {
  const batchRaw = params.batch?.trim() ?? "";
  const batchNum = Number(batchRaw);
  const batchYear =
    batchRaw &&
    Number.isFinite(batchNum) &&
    Number.isInteger(batchNum) &&
    batchNum >= 1900 &&
    batchNum <= 2100
      ? String(batchNum)
      : "all";

  const department = params.dept?.trim() || "all";

  const statusRaw = params.status?.trim().toLowerCase() ?? "";
  let status: "All" | ProfileRole = "All";
  if (statusRaw === "student") status = "Student";
  else if (statusRaw === "graduate") status = "Graduate";

  return { batchYear, department, status };
}

export default async function NetworkPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const { supabase, user } = await requireProfile();
  const params = await searchParams;
  const initialFilters = parseInitialFilters(params);

  const [{ data, error }, { data: conversationRows }] = await Promise.all([
    supabase
      .from("profiles")
      .select(
        "id, full_name, batch_year, status, department, current_job, company, role_title, is_founder, open_to, skills, linkedin_url, avatar_url, bio",
      )
      .neq("id", user.id)
      .order("batch_year", { ascending: false })
      .order("full_name", { ascending: true }),
    supabase
      .from("conversations")
      .select(
        "id, initiator_id, recipient_id, status, unlock_reason, intro_message_sent, created_at, updated_at",
      )
      .or(`initiator_id.eq.${user.id},recipient_id.eq.${user.id}`),
  ]);

  const profiles = ((data ?? []) as NetworkProfile[]).filter(
    (p) => p.id !== user.id,
  );
  const conversations = (conversationRows ?? []) as ConversationRow[];

  return (
    <PageShell accent="network">
      <Navbar />
      <main className="relative z-10 mx-auto w-full min-w-0 max-w-6xl flex-1 overflow-x-clip px-4 py-6 sm:px-6 sm:py-10">
        <PageHeader
          accent="network"
          eyebrow="Community"
          title="Network"
          description="Find seniors and graduates from your college — mentors, founders, and people who can help."
        />

        {error ? (
          <div className="surface-card border-red-200 bg-red-50 px-5 py-4 text-sm text-red-700">
            Couldn&apos;t load the network right now. If columns are missing,
            run the profiles migration SQL in Supabase first.
          </div>
        ) : (
          <NetworkDirectory
            profiles={profiles}
            currentUserId={user.id}
            initialConversations={conversations}
            initialFilters={initialFilters}
          />
        )}
      </main>
    </PageShell>
  );
}
