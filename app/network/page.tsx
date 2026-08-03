import { requireProfile } from "@/lib/require-profile";
import { Navbar } from "@/components/navbar";
import { NetworkDirectory } from "@/components/network-directory";
import { PageShell, PageHeader } from "@/components/ui/page-shell";
import type { ConversationRow } from "@/lib/conversations";
import type { NetworkProfile } from "@/lib/network";

export default async function NetworkPage() {
  const { supabase, user } = await requireProfile();

  const [{ data, error }, { data: conversationRows }] = await Promise.all([
    supabase
      .from("profiles")
      .select(
        "id, full_name, batch_year, department, current_job, company, role_title, is_founder, open_to, skills, linkedin_url, avatar_url, bio",
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
          />
        )}
      </main>
    </PageShell>
  );
}
