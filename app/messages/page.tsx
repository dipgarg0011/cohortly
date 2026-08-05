import { requireProfile } from "@/lib/require-profile";
import { Navbar } from "@/components/navbar";
import { MessagesInbox } from "@/components/messages-inbox";
import { PageShell, PageHeader } from "@/components/ui/page-shell";
import type { ConversationRow } from "@/lib/conversations";
import { partnerIdFromConversation } from "@/lib/conversations";
import type { ChatPartner, Message } from "@/lib/messages";
import { otherPartyId } from "@/lib/messages";
import type { MentorshipChatContext } from "@/components/mentorship-context-header";

type SearchParams = Promise<{ with?: string; request?: string }>;

export default async function MessagesPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const { supabase, user } = await requireProfile();
  const params = await searchParams;
  const withId = params.with?.trim() || null;
  const requestParam = params.request?.trim() || null;

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
        "id, initiator_id, recipient_id, status, unlock_reason, context_request_id, intro_message_sent, created_at, updated_at, gate_mode, turn_holder, reply_count_by_recipient, gate_lifted_at, gate_student_id",
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

  // Mentorship pinned context keyed by partner id.
  const contextByPartner: Record<string, MentorshipChatContext> = {};
  const requestIds = new Set<string>();
  for (const conv of conversations) {
    if (conv.context_request_id) requestIds.add(conv.context_request_id);
  }
  if (requestParam) requestIds.add(requestParam);

  if (requestIds.size > 0) {
    const ids = Array.from(requestIds);
    const [{ data: reqRows }, { data: answerRows }] = await Promise.all([
      supabase
        .from("mentorship_requests")
        .select("id, title, description")
        .in("id", ids),
      supabase
        .from("request_answers")
        .select("request_id, mentor_id, content, created_at")
        .in("request_id", ids)
        .order("created_at", { ascending: false }),
    ]);

    const reqById = new Map(
      ((reqRows ?? []) as { id: string; title: string; description: string }[]).map(
        (r) => [r.id, r],
      ),
    );
    const answers = (answerRows ?? []) as {
      request_id: string;
      mentor_id: string;
      content: string;
      created_at: string;
    }[];

    for (const conv of conversations) {
      const requestId = conv.context_request_id ?? null;
      if (!requestId) continue;
      const req = reqById.get(requestId);
      if (!req) continue;
      const partnerId = partnerIdFromConversation(conv, user.id);
      const answer =
        answers.find(
          (a) =>
            a.request_id === requestId &&
            (a.mentor_id === partnerId || a.mentor_id === user.id),
        ) ?? answers.find((a) => a.request_id === requestId);
      contextByPartner[partnerId] = {
        requestId,
        title: req.title,
        description: req.description,
        answerContent: answer?.content ?? null,
      };
    }

    // Deep-link ?request= when conversation row lacks context yet
    if (withId && requestParam && !contextByPartner[withId]) {
      const req = reqById.get(requestParam);
      if (req) {
        const answer =
          answers.find(
            (a) =>
              a.request_id === requestParam &&
              (a.mentor_id === withId || a.mentor_id === user.id),
          ) ?? answers.find((a) => a.request_id === requestParam);
        contextByPartner[withId] = {
          requestId: requestParam,
          title: req.title,
          description: req.description,
          answerContent: answer?.content ?? null,
        };
      }
    }
  }

  // Referral / opportunity titles for list labels
  const labelTitlesByPartner: Record<string, string> = {};
  for (const [partnerId, ctx] of Object.entries(contextByPartner)) {
    labelTitlesByPartner[partnerId] = ctx.title;
  }

  const referralConvPartners = conversations
    .filter(
      (c) =>
        c.unlock_reason === "referral" ||
        c.unlock_reason === "referral_question",
    )
    .map((c) => partnerIdFromConversation(c, user.id));
  if (referralConvPartners.length > 0) {
    const { data: refRows } = await supabase
      .from("referral_requests")
      .select("id, student_id, accepted_by, company, role")
      .or(
        `student_id.eq.${user.id},accepted_by.eq.${user.id}`,
      )
      .limit(40);
    for (const row of (refRows ?? []) as {
      student_id: string;
      accepted_by: string | null;
      company: string;
      role: string;
    }[]) {
      const other =
        row.student_id === user.id ? row.accepted_by : row.student_id;
      if (!other || !referralConvPartners.includes(other)) continue;
      labelTitlesByPartner[other] = row.company || row.role;
    }
  }

  const oppConvPartners = conversations
    .filter((c) => c.unlock_reason === "opportunity_application")
    .map((c) => partnerIdFromConversation(c, user.id));
  if (oppConvPartners.length > 0) {
    const { data: appRows } = await supabase
      .from("opportunity_applications")
      .select(
        `
        applicant_id,
        opportunity:opportunities!inner ( title, posted_by )
      `,
      )
      .or(
        `applicant_id.eq.${user.id},opportunity.posted_by.eq.${user.id}`,
      )
      .limit(40);
    for (const row of (appRows ?? []) as {
      applicant_id: string;
      opportunity:
        | { title: string; posted_by: string }
        | { title: string; posted_by: string }[]
        | null;
    }[]) {
      const opp = Array.isArray(row.opportunity)
        ? row.opportunity[0]
        : row.opportunity;
      if (!opp) continue;
      const other =
        row.applicant_id === user.id ? opp.posted_by : row.applicant_id;
      if (!oppConvPartners.includes(other)) continue;
      labelTitlesByPartner[other] = opp.title;
    }
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
          mentorshipContextByPartner={contextByPartner}
          labelTitlesByPartner={labelTitlesByPartner}
        />
      </main>
    </PageShell>
  );
}
