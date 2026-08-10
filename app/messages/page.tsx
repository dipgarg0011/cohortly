import { requireProfile } from "@/lib/require-profile";
import { Navbar } from "@/components/navbar";
import { MessagesInbox } from "@/components/messages-inbox";
import { PageShell, PageHeader } from "@/components/ui/page-shell";
import {
  CONVERSATION_SELECT,
  partnerIdFromConversation,
  resolveContextType,
  type ConversationRow,
} from "@/lib/conversations";
import type { ChatPartner, Message } from "@/lib/messages";
import { otherPartyId } from "@/lib/messages";
import {
  isSourceInactiveStatus,
  listLabelForConversation,
  opportunityStageLabel,
  referralStageLabel,
  snapshotFromUnknown,
  type ThreadContext,
} from "@/lib/conversation-context";
type SearchParams = Promise<{ with?: string; request?: string }>;

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
        "id, sender_id, receiver_id, content, created_at, read, conversation_id, is_system, message_kind",
      )
      .or(`sender_id.eq.${user.id},receiver_id.eq.${user.id}`)
      .order("created_at", { ascending: true }),
    supabase
      .from("conversations")
      .select(CONVERSATION_SELECT)
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
  const partnerById = new Map(partners.map((p) => [p.id, p]));

  // Collect polymorphic source ids
  const mentorshipIds = new Set<string>();
  const referralIds = new Set<string>();
  const applicationIds = new Set<string>();

  for (const conv of conversations) {
    const type = resolveContextType(conv);
    const id = conv.context_id ?? conv.context_request_id ?? null;
    if (!type || type === "connection") continue;
    if (type === "mentorship" && id) mentorshipIds.add(id);
    if ((type === "referral" || type === "referral_question") && id) {
      referralIds.add(id);
    }
    if (type === "opportunity" && id) applicationIds.add(id);
  }

  type MentorshipLive = {
    id: string;
    student_id: string;
    title: string;
    description: string;
    status: string;
    is_anonymous: boolean;
    revealed_at: string | null;
    target_company: string | null;
  };
  type ReferralLive = {
    id: string;
    student_id: string;
    helper_id: string | null;
    accepted_by: string | null;
    company: string;
    role: string;
    status: string;
  };
  type ApplicationLive = {
    id: string;
    applicant_id: string;
    pitch: string;
    status: string;
    opportunity:
      | {
          id: string;
          title: string;
          company: string | null;
          posted_by: string;
        }
      | {
          id: string;
          title: string;
          company: string | null;
          posted_by: string;
        }[]
      | null;
  };

  const [mentorshipRows, referralRows, applicationRows, answerRows] =
    await Promise.all([
      mentorshipIds.size > 0
        ? supabase
            .from("mentorship_requests")
            .select(
              "id, student_id, title, description, status, is_anonymous, revealed_at, target_company",
            )
            .in("id", Array.from(mentorshipIds))
        : Promise.resolve({ data: [] as MentorshipLive[] }),
      referralIds.size > 0
        ? supabase
            .from("referral_requests")
            .select(
              "id, student_id, helper_id, accepted_by, company, role, status",
            )
            .in("id", Array.from(referralIds))
        : Promise.resolve({ data: [] as ReferralLive[] }),
      applicationIds.size > 0
        ? supabase
            .from("opportunity_applications")
            .select(
              `
              id, applicant_id, pitch, status,
              opportunity:opportunities!inner ( id, title, company, posted_by )
            `,
            )
            .in("id", Array.from(applicationIds))
        : Promise.resolve({ data: [] as ApplicationLive[] }),
      mentorshipIds.size > 0
        ? supabase
            .from("request_answers")
            .select("request_id, mentor_id, content, created_at")
            .in("request_id", Array.from(mentorshipIds))
            .order("created_at", { ascending: false })
        : Promise.resolve({
            data: [] as {
              request_id: string;
              mentor_id: string;
              content: string;
              created_at: string;
            }[],
          }),
    ]);

  const mentorshipById = new Map(
    ((mentorshipRows.data ?? []) as MentorshipLive[]).map((r) => [r.id, r]),
  );
  const referralById = new Map(
    ((referralRows.data ?? []) as ReferralLive[]).map((r) => [r.id, r]),
  );
  const applicationById = new Map(
    ((applicationRows.data ?? []) as ApplicationLive[]).map((r) => [r.id, r]),
  );
  const answers = (answerRows.data ?? []) as {
    request_id: string;
    mentor_id: string;
    content: string;
    created_at: string;
  }[];

  const threadContextByPartner: Record<string, ThreadContext> = {};
  const labelTitlesByPartner: Record<string, string> = {};
  const anonymousPartnerIds: string[] = [];

  for (const conv of conversations) {
    const type = resolveContextType(conv);
    if (!type || type === "connection") continue;

    const partnerId = partnerIdFromConversation(conv, user.id);
    const partner = partnerById.get(partnerId);
    const snap = snapshotFromUnknown(conv.context_snapshot);
    const contextId =
      conv.context_id ??
      conv.context_request_id ??
      snap.request_id ??
      snap.application_id ??
      null;

    let ctx: ThreadContext | null = null;

    if (type === "mentorship") {
      const live = contextId ? mentorshipById.get(contextId) : undefined;
      const sourceActive = live
        ? !isSourceInactiveStatus("mentorship", live.status)
        : false;
      const studentId = live?.student_id ?? snap.student_id ?? conv.gate_student_id;
      const viewerIsStudent = studentId === user.id;
      const isAnonymous = Boolean(
        live?.is_anonymous ?? snap.is_anonymous ?? false,
      );
      const revealed = Boolean(live?.revealed_at);
      // Mentors must not see student identity until revealed (RLS may also null student_id)
      const hideName =
        !viewerIsStudent &&
        isAnonymous &&
        (!revealed || !live?.student_id);
      if (hideName) anonymousPartnerIds.push(partnerId);

      const answer =
        answers.find(
          (a) =>
            a.request_id === contextId &&
            (a.mentor_id === partnerId || a.mentor_id === user.id),
        ) ?? answers.find((a) => a.request_id === contextId);

      ctx = {
        conversationId: conv.id,
        contextType: "mentorship",
        contextId,
        snapshot: snap,
        sourceActive,
        viewerRole: viewerIsStudent ? "student" : "mentor",
        partnerName: hideName ? null : partner?.full_name ?? null,
        partnerNameHidden: hideName,
        company: live?.target_company ?? snap.company ?? null,
        role: null,
        title: live?.title ?? snap.title ?? null,
        stage: live?.status ?? null,
        stageLabel: live?.status ?? null,
        description: live?.description ?? snap.description ?? null,
        answerContent: answer?.content ?? null,
        pitch: null,
        linkHref: contextId ? `/mentors#request-${contextId}` : null,
        linkLabel: "View full request →",
        nextAction: null,
      };
    } else if (type === "referral" || type === "referral_question") {
      const live = contextId ? referralById.get(contextId) : undefined;
      const helperId = live
        ? live.helper_id ?? live.accepted_by
        : null;
      const viewerIsHelper = helperId === user.id;
      const sourceActive = live
        ? !isSourceInactiveStatus("referral", live.status)
        : false;
      const company = live?.company ?? snap.company ?? null;
      const role = live?.role ?? snap.role ?? null;

      let nextAction: ThreadContext["nextAction"] = null;
      if (
        sourceActive &&
        viewerIsHelper &&
        live &&
        (live.status === "in_progress" || live.status === "accepted") &&
        contextId
      ) {
        nextAction = {
          label: "Mark submitted",
          kind: "mark_submitted",
          sourceId: contextId,
        };
      }

      ctx = {
        conversationId: conv.id,
        contextType: type,
        contextId,
        snapshot: snap,
        sourceActive,
        viewerRole: viewerIsHelper ? "helper" : "requester",
        partnerName: partner?.full_name ?? null,
        partnerNameHidden: false,
        company,
        role,
        title: snap.title ?? (role && company ? `${role} at ${company}` : role),
        stage: live?.status ?? null,
        stageLabel: live ? referralStageLabel(live.status) : null,
        description: null,
        answerContent: null,
        pitch: null,
        linkHref: contextId
          ? `/referrals?tab=${viewerIsHelper ? "help" : "need"}&requestId=${encodeURIComponent(contextId)}`
          : "/referrals",
        linkLabel: "View referral →",
        nextAction,
      };
    } else if (type === "opportunity") {
      const live = contextId ? applicationById.get(contextId) : undefined;
      const oppRaw = live?.opportunity;
      const opp = Array.isArray(oppRaw) ? oppRaw[0] : oppRaw;
      const viewerIsPoster = opp?.posted_by === user.id;
      const sourceActive = live
        ? !isSourceInactiveStatus("opportunity", live.status)
        : false;
      const title = opp?.title ?? snap.role ?? snap.title ?? null;
      const company = opp?.company ?? snap.company ?? null;

      let nextAction: ThreadContext["nextAction"] = null;
      if (sourceActive && viewerIsPoster && live && contextId) {
        if (live.status === "reviewing") {
          nextAction = {
            label: "Shortlist",
            kind: "shortlist",
            sourceId: contextId,
          };
        } else if (live.status === "pending") {
          nextAction = {
            label: "Start reviewing",
            kind: "start_reviewing",
            sourceId: contextId,
          };
        }
      }

      ctx = {
        conversationId: conv.id,
        contextType: "opportunity",
        contextId,
        snapshot: snap,
        sourceActive,
        viewerRole: viewerIsPoster ? "poster" : "applicant",
        partnerName: partner?.full_name ?? null,
        partnerNameHidden: false,
        company,
        role: title,
        title,
        stage: live?.status ?? null,
        stageLabel: live ? opportunityStageLabel(live.status) : null,
        description: null,
        answerContent: null,
        pitch: live?.pitch ?? snap.pitch ?? null,
        linkHref: (() => {
          const oppId = opp?.id ?? snap.opportunity_id ?? null;
          const qs = new URLSearchParams({
            view: viewerIsPoster ? "applicants" : "mine",
          });
          if (contextId) qs.set("applicationId", contextId);
          if (oppId) qs.set("opportunityId", String(oppId));
          return `/opportunities?${qs.toString()}`;
        })(),
        linkLabel: "View opportunity →",
        nextAction,
      };
    }

    if (!ctx) continue;

    // Source missing → snapshot fallback + inactive banner
    if (!ctx.sourceActive && (snap.title || snap.company || snap.role)) {
      ctx = {
        ...ctx,
        sourceActive: false,
        company: ctx.company ?? snap.company ?? null,
        role: ctx.role ?? snap.role ?? null,
        title: ctx.title ?? snap.title ?? null,
        description: ctx.description ?? snap.description ?? null,
        pitch: ctx.pitch ?? snap.pitch ?? null,
      };
    }

    threadContextByPartner[partnerId] = ctx;

    const label = listLabelForConversation(conv);
    if (label) {
      labelTitlesByPartner[partnerId] = label
        .replace(/^Referral · /, "")
        .replace(/^Mentorship · /, "")
        .replace(/^Opportunity · /, "");
    } else if (ctx.company || ctx.title || ctx.role) {
      labelTitlesByPartner[partnerId] =
        ctx.company || ctx.title || ctx.role || "";
    }
  }

  // Mask anonymous partners in the partners list passed to client
  const partnersForClient = partners.map((p) => {
    if (!anonymousPartnerIds.includes(p.id)) return p;
    return {
      id: p.id,
      full_name: "Anonymous student",
      avatar_url: null,
    };
  });

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
          initialPartners={partnersForClient}
          initialConversations={conversations}
          initialWithId={withId}
          threadContextByPartner={threadContextByPartner}
          labelTitlesByPartner={labelTitlesByPartner}
          anonymousPartnerIds={anonymousPartnerIds}
        />
      </main>
    </PageShell>
  );
}
