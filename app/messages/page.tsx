import { requireProfile } from "@/lib/require-profile";
import { Navbar } from "@/components/navbar";
import { MessagesInbox } from "@/components/messages-inbox";
import { PageShell, PageHeader } from "@/components/ui/page-shell";
import type { ConversationRow } from "@/lib/conversations";
import { partnerIdFromConversation } from "@/lib/conversations";
import type { ChatPartner, Message } from "@/lib/messages";
import { otherPartyId } from "@/lib/messages";

type SearchParams = Promise<{ with?: string }>;

export default async function MessagesPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const { supabase, user } = await requireProfile();
  const params = await searchParams;
  const withId = params.with?.trim() || null;

  const [{ data: messageRows }, { data: conversationRows }] = await Promise.all([
    supabase
      .from("messages")
      .select(
        "id, sender_id, receiver_id, content, created_at, read, conversation_id, is_system",
      )
      .or(`sender_id.eq.${user.id},receiver_id.eq.${user.id}`)
      .order("created_at", { ascending: true }),
    supabase
      .from("conversations")
      .select(
        "id, initiator_id, recipient_id, status, unlock_reason, intro_message_sent, created_at, updated_at, gate_mode, turn_holder, reply_count_by_recipient, gate_lifted_at, gate_student_id",
      )
      .or(`initiator_id.eq.${user.id},recipient_id.eq.${user.id}`)
      .order("updated_at", { ascending: false }),
  ]);

  const messages = (messageRows ?? []) as Message[];
  const conversations = (conversationRows ?? []) as ConversationRow[];

  const partnerIds = new Set<string>();
  for (const message of messages) {
    partnerIds.add(otherPartyId(message, user.id));
  }
  for (const conv of conversations) {
    partnerIds.add(partnerIdFromConversation(conv, user.id));
  }
  if (withId) partnerIds.add(withId);

  let partners: ChatPartner[] = [];
  if (partnerIds.size > 0) {
    const { data: profileRows } = await supabase
      .from("profiles")
      .select("id, full_name, avatar_url")
      .in("id", Array.from(partnerIds));
    partners = (profileRows ?? []) as ChatPartner[];
  }

  return (
    <PageShell accent="messages">
      <Navbar />
      <main className="relative z-10 mx-auto w-full min-w-0 max-w-6xl flex-1 overflow-x-clip px-3 py-5 sm:px-6 sm:py-8">
        <PageHeader
          accent="messages"
          eyebrow="Inbox"
          title="Messages"
          description="Connection requests and chats with your college community."
        />

        <MessagesInbox
          currentUserId={user.id}
          initialMessages={messages}
          initialPartners={partners}
          initialConversations={conversations}
          initialWithId={withId}
        />
      </main>
    </PageShell>
  );
}
