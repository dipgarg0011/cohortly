"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
} from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { firstName, getInitials } from "@/lib/network";
import { EmptyState } from "@/components/ui/empty-state";
import { IconChatEmpty } from "@/components/ui/icons";
import { ProfilePreviewTrigger } from "@/components/profile-preview";
import {
  conversationContextLabel,
  conversationLabelFromRow,
  isConnectionRequest,
  mapMessagingError,
  partnerIdFromConversation,
  resolveContextType,
  studentTurnGate,
  TURN_FOLLOWUP_MAX,
  type ConversationRow,
  type ContextType,
} from "@/lib/conversations";
import {
  formatAbsoluteTime,
  formatChatBubbleTime,
  formatRelativeTime,
} from "@/lib/format-time";
import {
  isSystemMessage,
  otherPartyId,
  type ChatPartner,
  type Message,
} from "@/lib/messages";
import { compactDisplayName } from "@/lib/display-name";
import {
  ConversationContextHeader,
  ConversationTypeLabel,
  type ContextNextAction,
  type ThreadContext,
} from "@/components/conversation-context-header";
import { suggestedOpeners } from "@/lib/conversation-context";
import { ChatSafetySheet } from "@/components/chat-safety-sheet";
import {
  blockConversation,
  disconnectConversation,
  reportUser,
  type ReportReasonId,
} from "@/lib/safety";

type InboxTab = "chats" | "requests";
type TypeFilter = "all" | "referral" | "mentorship" | "opportunity" | "connection";

type Props = {
  currentUserId: string;
  /** Current user avatar/name for sent-bubble avatars (matches mobile). */
  currentUserProfile?: Pick<ChatPartner, "full_name" | "avatar_url"> | null;
  initialMessages: Message[];
  initialPartners: ChatPartner[];
  initialConversations: ConversationRow[];
  initialWithId: string | null;
  threadContextByPartner?: Record<string, ThreadContext>;
  labelTitlesByPartner?: Record<string, string>;
  anonymousPartnerIds?: string[];
  /** @deprecated Prefer threadContextByPartner */
  mentorshipContextByPartner?: Record<string, never>;
};

type ListItem = {
  partner: ChatPartner;
  conversation: ConversationRow;
  lastMessage: Message | null;
  unreadCount: number;
};

export function MessagesInbox({
  currentUserId,
  currentUserProfile = null,
  initialMessages,
  initialPartners,
  initialConversations,
  initialWithId,
  threadContextByPartner: initialThreadContext = {},
  labelTitlesByPartner = {},
  anonymousPartnerIds = [],
}: Props) {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);
  const [messages, setMessages] = useState<Message[]>(initialMessages);
  const [conversations, setConversations] =
    useState<ConversationRow[]>(initialConversations);
  const [partners, setPartners] = useState<Record<string, ChatPartner>>(() => {
    const map: Record<string, ChatPartner> = {};
    for (const p of initialPartners) map[p.id] = p;
    return map;
  });
  const [threadContextByPartner, setThreadContextByPartner] = useState(
    initialThreadContext,
  );
  const anonymousSet = useMemo(
    () => new Set(anonymousPartnerIds),
    [anonymousPartnerIds],
  );
  const [selectedId, setSelectedId] = useState<string | null>(initialWithId);
  const [tab, setTab] = useState<InboxTab>("chats");
  const [typeFilter, setTypeFilter] = useState<TypeFilter>("all");
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [responding, setResponding] = useState(false);
  const [actionBusy, setActionBusy] = useState(false);
  const [safetyOpen, setSafetyOpen] = useState(false);
  const [safetyBusy, setSafetyBusy] = useState(false);
  const [safetyError, setSafetyError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [mobileShowChat, setMobileShowChat] = useState(Boolean(initialWithId));
  const bottomRef = useRef<HTMLDivElement>(null);

  function contextLabelFor(item: ListItem): string | null {
    const fromRow = conversationLabelFromRow(item.conversation);
    if (fromRow) return fromRow;
    const title =
      labelTitlesByPartner[item.partner.id] ??
      threadContextByPartner[item.partner.id]?.company ??
      threadContextByPartner[item.partner.id]?.title ??
      null;
    return conversationContextLabel(
      resolveContextType(item.conversation) ??
        item.conversation.unlock_reason,
      title,
    );
  }

  function matchesTypeFilter(conv: ConversationRow): boolean {
    if (typeFilter === "all") return true;
    const type = resolveContextType(conv) ?? "connection";
    if (typeFilter === "referral") {
      return type === "referral" || type === "referral_question";
    }
    if (typeFilter === "connection") {
      return type === "connection" || type == null;
    }
    return type === typeFilter;
  }

  const ensurePartner = useCallback(
    async (partnerId: string) => {
      if (anonymousSet.has(partnerId)) {
        const masked: ChatPartner = {
          id: partnerId,
          full_name: "Anonymous student",
          avatar_url: null,
        };
        setPartners((prev) => ({ ...prev, [partnerId]: masked }));
        return masked;
      }

      const { data } = await supabase
        .from("profiles")
        .select("id, full_name, avatar_url")
        .eq("id", partnerId)
        .maybeSingle();

      const partner: ChatPartner = data ?? {
        id: partnerId,
        full_name: null,
        avatar_url: null,
      };

      setPartners((prev) => {
        if (prev[partnerId]) return prev;
        return { ...prev, [partnerId]: partner };
      });

      return partner;
    },
    [supabase, anonymousSet],
  );

  const upsertMessage = useCallback((incoming: Message) => {
    setMessages((prev) => {
      // Reconcile optimistic temp rows (temp-*) with the server row.
      const withoutTemp = prev.filter((m) => {
        if (!m.id.startsWith("temp-")) return true;
        return !(
          m.sender_id === incoming.sender_id &&
          m.receiver_id === incoming.receiver_id &&
          m.content === incoming.content
        );
      });
      if (withoutTemp.some((m) => m.id === incoming.id)) {
        return withoutTemp.map((m) =>
          m.id === incoming.id ? incoming : m,
        );
      }
      return [...withoutTemp, incoming];
    });
  }, []);

  const upsertConversation = useCallback((row: ConversationRow) => {
    setConversations((prev) => {
      const idx = prev.findIndex((c) => c.id === row.id);
      if (idx === -1) return [...prev, row];
      const next = [...prev];
      next[idx] = row;
      return next;
    });
  }, []);

  const markConversationRead = useCallback(
    async (partnerId: string) => {
      const { data, error: updateError } = await supabase
        .from("messages")
        .update({ read: true })
        .eq("receiver_id", currentUserId)
        .eq("sender_id", partnerId)
        .eq("read", false)
        .select("id");

      if (updateError || !data?.length) return;

      const ids = new Set(data.map((row) => row.id));
      setMessages((prev) =>
        prev.map((m) => (ids.has(m.id) ? { ...m, read: true } : m)),
      );
    },
    [currentUserId, supabase],
  );

  const conversationByPartner = useMemo(() => {
    const map = new Map<string, ConversationRow>();
    for (const c of conversations) {
      if (c.status === "declined" || c.status === "blocked") continue;
      map.set(partnerIdFromConversation(c, currentUserId), c);
    }
    return map;
  }, [conversations, currentUserId]);

  const selectedConversation = selectedId
    ? conversationByPartner.get(selectedId) ?? null
    : null;

  const turnGate = studentTurnGate(
    selectedConversation ?? undefined,
    currentUserId,
  );

  const requestItems = useMemo((): ListItem[] => {
    return conversations
      .filter(
        (c) =>
          c.status === "pending" &&
          c.recipient_id === currentUserId &&
          isConnectionRequest(c),
      )
      .map((conversation) => {
        const partnerId = conversation.initiator_id;
        const threadMsgs = messages.filter(
          (m) =>
            (m.sender_id === currentUserId && m.receiver_id === partnerId) ||
            (m.sender_id === partnerId && m.receiver_id === currentUserId),
        );
        const lastMessage =
          threadMsgs.sort(
            (a, b) =>
              new Date(b.created_at).getTime() -
              new Date(a.created_at).getTime(),
          )[0] ?? null;
        const unreadCount = threadMsgs.filter(
          (m) =>
            m.receiver_id === currentUserId &&
            !m.read &&
            !isSystemMessage(m),
        ).length;
        return {
          partner: partners[partnerId] ?? {
            id: partnerId,
            full_name: null,
            avatar_url: null,
          },
          conversation,
          lastMessage,
          unreadCount,
        };
      })
      .sort(
        (a, b) =>
          new Date(b.conversation.created_at).getTime() -
          new Date(a.conversation.created_at).getTime(),
      );
  }, [conversations, messages, partners, currentUserId]);

  const chatItems = useMemo((): ListItem[] => {
    return conversations
      .filter((c) => {
        if (c.status === "accepted") return true;
        // Outbound pending so sender can open locked thread
        if (c.status === "pending" && c.initiator_id === currentUserId) {
          return true;
        }
        // Opportunity / referral / mentorship pending: show in Chats with
        // stage actions — not as connection Accept/Decline in Requests.
        if (
          c.status === "pending" &&
          c.recipient_id === currentUserId &&
          !isConnectionRequest(c)
        ) {
          return true;
        }
        return false;
      })
      .map((conversation) => {
        const partnerId = partnerIdFromConversation(
          conversation,
          currentUserId,
        );
        const threadMsgs = messages.filter(
          (m) =>
            (m.sender_id === currentUserId && m.receiver_id === partnerId) ||
            (m.sender_id === partnerId && m.receiver_id === currentUserId),
        );
        const lastMessage =
          threadMsgs.sort(
            (a, b) =>
              new Date(b.created_at).getTime() -
              new Date(a.created_at).getTime(),
          )[0] ?? null;
        const unreadCount = threadMsgs.filter(
          (m) =>
            m.receiver_id === currentUserId &&
            !m.read &&
            !isSystemMessage(m),
        ).length;
        return {
          partner: partners[partnerId] ?? {
            id: partnerId,
            full_name: null,
            avatar_url: null,
          },
          conversation,
          lastMessage,
          unreadCount,
        };
      })
      .sort((a, b) => {
        const aTime = a.lastMessage?.created_at ?? a.conversation.updated_at;
        const bTime = b.lastMessage?.created_at ?? b.conversation.updated_at;
        return new Date(bTime).getTime() - new Date(aTime).getTime();
      });
  }, [conversations, messages, partners, currentUserId]);

  const listItems = useMemo(() => {
    const base = tab === "chats" ? chatItems : requestItems;
    if (tab !== "chats" || typeFilter === "all") return base;
    return base.filter((item) => matchesTypeFilter(item.conversation));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, chatItems, requestItems, typeFilter]);

  const thread = useMemo(() => {
    if (!selectedId) return [];
    return messages
      .filter(
        (m) =>
          (m.sender_id === currentUserId && m.receiver_id === selectedId) ||
          (m.sender_id === selectedId && m.receiver_id === currentUserId),
      )
      .sort(
        (a, b) =>
          new Date(a.created_at).getTime() - new Date(b.created_at).getTime(),
      );
  }, [messages, selectedId, currentUserId]);

  const selectedPartner = selectedId ? partners[selectedId] : null;

  const isLockedForSender =
    selectedConversation?.status === "pending" &&
    selectedConversation.initiator_id === currentUserId &&
    selectedConversation.intro_message_sent;

  const isIncomingRequest =
    selectedConversation?.status === "pending" &&
    selectedConversation.recipient_id === currentUserId &&
    isConnectionRequest(selectedConversation);

  // Open deep-link on the right tab
  useEffect(() => {
    if (!initialWithId) return;
    const conv = conversations.find((c) => {
      const partner = partnerIdFromConversation(c, currentUserId);
      return partner === initialWithId;
    });
    if (
      conv?.status === "pending" &&
      conv.recipient_id === currentUserId &&
      isConnectionRequest(conv)
    ) {
      setTab("requests");
    }
  }, [initialWithId, conversations, currentUserId]);

  useEffect(() => {
    if (!selectedId) return;
    void ensurePartner(selectedId);
    void markConversationRead(selectedId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [thread.length, selectedId]);

  // Realtime inbox: messages addressed to me + my conversations (unsub on unmount)
  useEffect(() => {
    const channel = supabase
      .channel(`messages-inbox:${currentUserId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "messages",
          filter: `receiver_id=eq.${currentUserId}`,
        },
        (payload) => {
          const row = payload.new as Message;
          upsertMessage(row);
          void ensurePartner(otherPartyId(row, currentUserId));

          if (row.sender_id === selectedId) {
            void markConversationRead(row.sender_id);
          }
        },
      )
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "messages",
          filter: `receiver_id=eq.${currentUserId}`,
        },
        (payload) => {
          upsertMessage(payload.new as Message);
        },
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "conversations",
          filter: `initiator_id=eq.${currentUserId}`,
        },
        (payload) => {
          if (payload.eventType === "DELETE") {
            const old = payload.old as { id?: string };
            if (old.id) {
              setConversations((prev) => prev.filter((c) => c.id !== old.id));
            }
            return;
          }
          const row = payload.new as ConversationRow;
          upsertConversation(row);
          void ensurePartner(partnerIdFromConversation(row, currentUserId));
        },
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "conversations",
          filter: `recipient_id=eq.${currentUserId}`,
        },
        (payload) => {
          if (payload.eventType === "DELETE") {
            const old = payload.old as { id?: string };
            if (old.id) {
              setConversations((prev) => prev.filter((c) => c.id !== old.id));
            }
            return;
          }
          const row = payload.new as ConversationRow;
          upsertConversation(row);
          void ensurePartner(partnerIdFromConversation(row, currentUserId));
        },
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [
    supabase,
    currentUserId,
    selectedId,
    upsertMessage,
    upsertConversation,
    ensurePartner,
    markConversationRead,
  ]);

  // Realtime thread: filter to the open conversation; unsub when it changes/unmounts
  useEffect(() => {
    const conversationId = selectedConversation?.id;
    if (!conversationId) return;

    const channel = supabase
      .channel(`messages-thread:${conversationId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "messages",
          filter: `conversation_id=eq.${conversationId}`,
        },
        (payload) => {
          upsertMessage(payload.new as Message);
        },
      )
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "messages",
          filter: `conversation_id=eq.${conversationId}`,
        },
        (payload) => {
          upsertMessage(payload.new as Message);
        },
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [supabase, selectedConversation?.id, upsertMessage]);

  async function handleSend(event: FormEvent) {
    event.preventDefault();
    if (!selectedId || isLockedForSender) return;
    if (turnGate.isStudent && !turnGate.canSend) return;

    const trimmed = draft.trim();
    if (!trimmed) return;

    if (
      turnGate.isStudent &&
      turnGate.canSend &&
      trimmed.length > TURN_FOLLOWUP_MAX
    ) {
      setError(
        `Follow-ups are limited to ${TURN_FOLLOWUP_MAX} characters until you can chat freely.`,
      );
      return;
    }

    setSending(true);
    setError(null);

    // Optimistic row — placeholder time only; replaced by DB created_at on success.
    const tempId = `temp-${crypto.randomUUID()}`;
    const optimistic: Message = {
      id: tempId,
      sender_id: currentUserId,
      receiver_id: selectedId,
      content: trimmed,
      created_at: new Date().toISOString(),
      read: false,
      conversation_id: selectedConversation?.id ?? null,
      is_system: false,
    };
    upsertMessage(optimistic);
    setDraft("");

    // Do not send client created_at — DB default now() is source of truth.
    const { data, error: insertError } = await supabase
      .from("messages")
      .insert({
        sender_id: currentUserId,
        receiver_id: selectedId,
        content: trimmed,
        read: false,
      })
      .select(
        "id, sender_id, receiver_id, content, created_at, read, conversation_id, is_system, message_kind",
      )
      .single();

    if (insertError) {
      setMessages((prev) => prev.filter((m) => m.id !== tempId));
      setDraft(trimmed);
      setError(mapMessagingError(insertError));
      setSending(false);
      return;
    }

    if (data) upsertMessage(data as Message);
    else setMessages((prev) => prev.filter((m) => m.id !== tempId));
    setSending(false);
  }

  async function handleNextAction(action: ContextNextAction) {
    if (actionBusy) return;
    setActionBusy(true);
    setError(null);

    if (action.kind === "mark_submitted") {
      const { error: rpcError } = await supabase.rpc("update_referral_stage", {
        p_request_id: action.sourceId,
        p_new_status: "submitted",
      });
      if (rpcError) {
        setError(mapMessagingError(rpcError));
        setActionBusy(false);
        return;
      }
      if (selectedId && threadContextByPartner[selectedId]) {
        setThreadContextByPartner((prev) => {
          const cur = prev[selectedId];
          if (!cur) return prev;
          return {
            ...prev,
            [selectedId]: {
              ...cur,
              stage: "submitted",
              stageLabel: "Submitted",
              nextAction: null,
            },
          };
        });
      }
    } else if (action.kind === "shortlist" || action.kind === "start_reviewing") {
      const status =
        action.kind === "shortlist" ? "shortlisted" : "reviewing";
      const { error: rpcError } = await supabase.rpc(
        "decide_opportunity_application",
        {
          p_application_id: action.sourceId,
          p_new_status: status,
          p_outcome: action.kind === "shortlist" ? "moved_forward" : null,
        },
      );
      if (rpcError) {
        setError(mapMessagingError(rpcError));
        setActionBusy(false);
        return;
      }
      if (selectedId && threadContextByPartner[selectedId]) {
        setThreadContextByPartner((prev) => {
          const cur = prev[selectedId];
          if (!cur) return prev;
          return {
            ...prev,
            [selectedId]: {
              ...cur,
              stage: status,
              stageLabel:
                status === "shortlisted" ? "Shortlisted" : "Being reviewed",
              nextAction:
                status === "reviewing"
                  ? {
                      label: "Shortlist",
                      kind: "shortlist",
                      sourceId: action.sourceId,
                    }
                  : null,
            },
          };
        });
      }
    }

    setActionBusy(false);
  }

  async function handleRespond(status: "accepted" | "declined" | "blocked") {
    if (!selectedConversation || responding) return;

    setResponding(true);
    setError(null);

    const { data, error: rpcError } = await supabase.rpc(
      "respond_to_conversation",
      {
        p_conversation_id: selectedConversation.id,
        p_new_status: status,
      },
    );

    if (rpcError) {
      setError(mapMessagingError(rpcError));
      setResponding(false);
      return;
    }

    const updated = (Array.isArray(data) ? data[0] : data) as
      | ConversationRow
      | undefined;

    if (updated) {
      upsertConversation(updated);
    } else {
      upsertConversation({ ...selectedConversation, status });
    }

    setResponding(false);

    if (status === "accepted") {
      setTab("chats");
    } else {
      setSelectedId(null);
      setMobileShowChat(false);
      router.replace("/messages");
    }
  }

  async function leaveAfterSafety(updated: ConversationRow | null) {
    if (updated) upsertConversation(updated);
    setSafetyOpen(false);
    setSafetyBusy(false);
    setSafetyError(null);
    setSelectedId(null);
    setMobileShowChat(false);
    router.replace("/messages");
  }

  async function handleDisconnect() {
    if (!selectedConversation || safetyBusy) return;
    setSafetyBusy(true);
    setSafetyError(null);
    setError(null);
    const { data, error: err } = await disconnectConversation(
      supabase,
      selectedConversation.id,
    );
    if (err) {
      setSafetyError(err);
      setSafetyBusy(false);
      return;
    }
    await leaveAfterSafety(data);
  }

  async function handleBlockFromSafety() {
    if (!selectedConversation || safetyBusy) return;
    setSafetyBusy(true);
    setSafetyError(null);
    setError(null);
    const { data, error: err } = await blockConversation(
      supabase,
      selectedConversation.id,
    );
    if (err) {
      setSafetyError(err);
      setSafetyBusy(false);
      return;
    }
    await leaveAfterSafety(data);
  }

  async function handleReport(
    reason: ReportReasonId,
    details: string,
    alsoBlock: boolean,
  ) {
    if (!selectedConversation || !selectedId || safetyBusy) return;
    setSafetyBusy(true);
    setSafetyError(null);
    setError(null);
    const { error: err } = await reportUser(supabase, {
      reportedId: selectedId,
      reason,
      details,
      conversationId: selectedConversation.id,
      alsoBlock,
    });
    if (err) {
      setSafetyError(err);
      setSafetyBusy(false);
      return;
    }
    if (alsoBlock) {
      await leaveAfterSafety({
        ...selectedConversation,
        status: "blocked",
      });
    } else {
      setSafetyOpen(false);
      setSafetyBusy(false);
      setSafetyError(null);
    }
  }

  function openConversation(partnerId: string, preferTab?: InboxTab) {
    setSelectedId(partnerId);
    setMobileShowChat(true);
    setError(null);
    if (preferTab) setTab(preferTab);
    router.replace(`/messages?with=${partnerId}`);
  }

  const requestCount = requestItems.length;
  const selectedThreadContext = selectedId
    ? threadContextByPartner[selectedId] ?? null
    : null;
  const partnerIsAnonymous = Boolean(
    selectedId &&
      (anonymousSet.has(selectedId) ||
        selectedThreadContext?.partnerNameHidden),
  );
  const partnerName = partnerIsAnonymous
    ? "Anonymous student"
    : selectedPartner?.full_name?.trim() || "Unnamed member";
  const partnerFirst = partnerIsAnonymous
    ? "them"
    : firstName(selectedPartner?.full_name);
  const emptyThreadOpeners =
    selectedThreadContext && thread.length === 0
      ? suggestedOpeners(selectedThreadContext).slice(0, 3)
      : [];

  return (
    <div className="section-card flex min-h-[min(32rem,calc(100dvh-9rem))] w-full max-w-full flex-1 overflow-hidden !p-0 md:min-h-[calc(100dvh-9rem)]">
      <aside
        className={`w-full max-w-full shrink-0 border-teal-900/8 md:w-80 md:border-r lg:w-96 ${
          mobileShowChat ? "hidden md:flex" : "flex"
        } flex-col`}
      >
        <div className="border-b border-teal-900/8 px-4 pt-3">
          <h2 className="font-semibold text-slate-900">Inbox</h2>
          <div
            className="mt-3 grid grid-cols-2 gap-1 rounded-xl bg-teal-50 p-1"
            role="tablist"
            aria-label="Inbox tabs"
          >
            <button
              type="button"
              role="tab"
              aria-selected={tab === "chats"}
              onClick={() => setTab("chats")}
              className={`rounded-lg px-2 py-2 text-sm font-semibold transition ${
                tab === "chats"
                  ? "bg-white text-teal-900 shadow-sm"
                  : "text-teal-700/70 hover:text-teal-900"
              }`}
            >
              Chats
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={tab === "requests"}
              onClick={() => setTab("requests")}
              className={`relative rounded-lg px-2 py-2 text-sm font-semibold transition ${
                tab === "requests"
                  ? "bg-white text-teal-900 shadow-sm"
                  : "text-teal-700/70 hover:text-teal-900"
              }`}
            >
              Requests
              {requestCount > 0 && (
                <span className="ml-1.5 inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-[var(--brand)] px-1.5 text-[10px] font-bold text-white">
                  {requestCount > 9 ? "9+" : requestCount}
                </span>
              )}
            </button>
          </div>
          {tab === "chats" ? (
            <div
              className="mt-2 flex flex-wrap gap-1 pb-2"
              role="group"
              aria-label="Filter by type"
            >
              {(
                [
                  ["all", "All"],
                  ["referral", "Referral"],
                  ["mentorship", "Mentorship"],
                  ["opportunity", "Opportunity"],
                  ["connection", "Connection"],
                ] as const
              ).map(([id, label]) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => setTypeFilter(id)}
                  className={`rounded-lg px-2 py-1 text-[11px] font-semibold transition ${
                    typeFilter === id
                      ? "bg-teal-800 text-white"
                      : "bg-teal-50 text-teal-800 hover:bg-teal-100"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          ) : null}
        </div>

        {listItems.length === 0 ? (
          <div className="flex flex-1 items-center p-4">
            <EmptyState
              icon={<IconChatEmpty />}
              title={
                tab === "chats" ? "No chats yet" : "No connection requests"
              }
              description={
                tab === "chats"
                  ? "Send a request from Network — once they accept, your chat will show up here."
                  : "When someone wants to connect, their intro message will appear here."
              }
              actionHref={tab === "chats" ? "/network" : undefined}
              actionLabel={tab === "chats" ? "Browse Network" : undefined}
              accentSoft="var(--accent-messages-soft)"
            />
          </div>
        ) : (
          <ul className="flex-1 overflow-y-auto">
            {listItems.map((item) => {
              const active = item.partner.id === selectedId;
              const name =
                item.partner.full_name?.trim() || "Unnamed member";
              const displayName = compactDisplayName(item.partner.full_name);
              const pendingOut =
                item.conversation.status === "pending" &&
                item.conversation.initiator_id === currentUserId;
              return (
                <li key={item.conversation.id}>
                  <div
                    onClick={() =>
                      openConversation(
                        item.partner.id,
                        tab === "requests" ? "requests" : "chats",
                      )
                    }
                    className={`flex w-full cursor-pointer items-start gap-3 px-4 py-3 text-left transition ${
                      active ? "bg-teal-50" : "hover:bg-teal-50/60"
                    }`}
                  >
                    <ProfilePreviewTrigger
                      userId={item.partner.id}
                      enabled={!anonymousSet.has(item.partner.id)}
                      className="shrink-0"
                    >
                      <Avatar
                        name={
                          anonymousSet.has(item.partner.id)
                            ? null
                            : item.partner.full_name
                        }
                        url={
                          anonymousSet.has(item.partner.id)
                            ? null
                            : item.partner.avatar_url
                        }
                        anonymous={anonymousSet.has(item.partner.id)}
                      />
                    </ProfilePreviewTrigger>
                    <div className="min-w-0 flex-1">
                      <div className="flex min-w-0 items-center gap-2">
                        <ProfilePreviewTrigger
                          userId={item.partner.id}
                          className="min-w-0 flex-1 overflow-hidden"
                        >
                          <span
                            title={name}
                            className="block min-w-0 truncate whitespace-nowrap text-sm font-semibold text-slate-900"
                          >
                            {displayName}
                          </span>
                        </ProfilePreviewTrigger>
                        <span
                          className="shrink-0 text-[11px] text-slate-400"
                          title={formatAbsoluteTime(
                            item.lastMessage?.created_at ??
                              item.conversation.created_at,
                          )}
                        >
                          {formatRelativeTime(
                            item.lastMessage?.created_at ??
                              item.conversation.created_at,
                          )}
                        </span>
                      </div>
                      <div className="mt-0.5 flex items-center gap-2">
                        <div className="min-w-0 flex-1 overflow-hidden">
                          {(() => {
                            const ctxLabel = contextLabelFor(item);
                            const ctxType = resolveContextType(
                              item.conversation,
                            ) as ContextType | null;
                            return ctxLabel ? (
                              <ConversationTypeLabel
                                label={ctxLabel}
                                contextType={ctxType}
                              />
                            ) : null;
                          })()}
                          <p className="truncate text-xs text-slate-500">
                            {pendingOut
                              ? "Waiting for acceptance…"
                              : item.lastMessage
                                ? `${
                                    item.lastMessage.sender_id ===
                                      currentUserId &&
                                    !isSystemMessage(item.lastMessage)
                                      ? "You: "
                                      : ""
                                  }${item.lastMessage.content}`
                                : "Connection request"}
                          </p>
                        </div>
                        {item.unreadCount > 0 && (
                          <span className="ml-auto inline-flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full bg-[var(--brand)] px-1.5 text-[10px] font-bold text-white">
                            {item.unreadCount > 9 ? "9+" : item.unreadCount}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </aside>

      <section
        className={`min-w-0 flex-1 flex-col ${
          mobileShowChat ? "flex" : "hidden md:flex"
        }`}
      >
        {!selectedId || !selectedPartner || !selectedConversation ? (
          <div className="flex flex-1 flex-col items-center justify-center px-6 py-10">
            <EmptyState
              icon={<IconChatEmpty />}
              title="Pick a conversation"
              description="Accepted chats and incoming requests live in the tabs on the left."
              actionHref="/network"
              actionLabel="Find people"
              accentSoft="var(--accent-messages-soft)"
            />
          </div>
        ) : (
          <>
            <div className="flex min-w-0 items-center gap-3 border-b border-teal-900/8 px-3 py-3 sm:px-4">
              <button
                type="button"
                className="shrink-0 rounded-lg px-2 py-1 text-sm font-medium text-teal-800 md:hidden"
                onClick={() => {
                  setMobileShowChat(false);
                  setSelectedId(null);
                  router.replace("/messages");
                }}
              >
                ← Back
              </button>
              <ProfilePreviewTrigger
                userId={selectedId}
                enabled={!partnerIsAnonymous}
                className="shrink-0"
              >
                <Avatar
                  name={partnerIsAnonymous ? null : selectedPartner.full_name}
                  url={partnerIsAnonymous ? null : selectedPartner.avatar_url}
                  size="sm"
                  anonymous={partnerIsAnonymous}
                />
              </ProfilePreviewTrigger>
              <div className="min-w-0 flex-1">
                <ProfilePreviewTrigger
                  userId={selectedId}
                  enabled={!partnerIsAnonymous}
                >
                  <p
                    title={partnerName}
                    className="min-w-0 truncate whitespace-nowrap font-semibold text-slate-900"
                  >
                    {partnerName}
                  </p>
                </ProfilePreviewTrigger>
                {selectedConversation.status === "pending" &&
                isConnectionRequest(selectedConversation) ? (
                  <p className="text-xs text-slate-500">Connection request</p>
                ) : (
                  (() => {
                    const ctxLabel = conversationLabelFromRow(
                      selectedConversation,
                    ) ?? conversationContextLabel(
                      resolveContextType(selectedConversation) ??
                        selectedConversation.unlock_reason,
                      labelTitlesByPartner[selectedId] ??
                        selectedThreadContext?.company ??
                        selectedThreadContext?.title ??
                        null,
                    );
                    if (ctxLabel) {
                      return (
                        <ConversationTypeLabel
                          label={ctxLabel}
                          contextType={resolveContextType(selectedConversation)}
                        />
                      );
                    }
                    if (selectedConversation.status === "pending") {
                      return (
                        <p className="text-xs text-slate-500">
                          Waiting for acceptance…
                        </p>
                      );
                    }
                    return null;
                  })()
                )}
              </div>
              {selectedConversation.status !== "blocked" &&
              selectedConversation.status !== "declined" ? (
                <button
                  type="button"
                  onClick={() => {
                    setSafetyError(null);
                    setSafetyOpen(true);
                  }}
                  aria-label="Safety options: Unmatch, Block, or Report"
                  className="inline-flex shrink-0 items-center gap-1.5 rounded-xl border border-teal-200 bg-teal-50 px-3 py-1.5 text-sm font-bold text-[var(--brand)] transition hover:bg-teal-100"
                >
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    viewBox="0 0 20 20"
                    fill="currentColor"
                    className="h-4 w-4"
                    aria-hidden
                  >
                    <path
                      fillRule="evenodd"
                      d="M10 1a4.5 4.5 0 00-4.5 4.5V9H5a2 2 0 00-2 2v6a2 2 0 002 2h10a2 2 0 002-2v-6a2 2 0 00-2-2h-.5V5.5A4.5 4.5 0 0010 1zm3 8V5.5a3 3 0 10-6 0V9h6z"
                      clipRule="evenodd"
                    />
                  </svg>
                  Safety
                </button>
              ) : null}
            </div>

            {selectedThreadContext ? (
              <ConversationContextHeader
                context={selectedThreadContext}
                busyAction={actionBusy}
                onNextAction={(action) => void handleNextAction(action)}
              />
            ) : null}

            {isIncomingRequest && (
              <div className="border-b border-teal-900/8 bg-white px-4 py-4">
                <p className="text-center text-sm font-semibold text-slate-900">
                  {partnerFirst === "them" ? partnerName : partnerFirst} wants
                  to connect
                </p>
                {thread[0] ? (
                  <p className="mx-auto mt-2 max-w-md break-safe rounded-[1.125rem] rounded-bl-md border border-teal-900/10 bg-white px-3.5 py-2.5 text-sm text-slate-800 shadow-sm">
                    “{thread[0].content}”
                  </p>
                ) : null}
                <div className="mt-3 flex gap-2">
                  <button
                    type="button"
                    disabled={responding}
                    onClick={() => void handleRespond("accepted")}
                    className="inline-flex min-h-11 flex-1 items-center justify-center rounded-xl bg-[var(--brand)] text-sm font-bold text-white transition hover:bg-[var(--brand-dark)] disabled:opacity-60"
                  >
                    Accept
                  </button>
                  <button
                    type="button"
                    disabled={responding}
                    onClick={() => void handleRespond("declined")}
                    className="inline-flex min-h-11 flex-1 items-center justify-center rounded-xl border border-slate-200 bg-white text-sm font-bold text-slate-700 transition hover:bg-slate-50 disabled:opacity-60"
                  >
                    Decline
                  </button>
                </div>
                <button
                  type="button"
                  disabled={responding}
                  onClick={() => void handleRespond("blocked")}
                  className="mt-2 w-full py-2 text-center text-sm font-semibold text-red-700 transition hover:text-red-800 disabled:opacity-60"
                >
                  Block
                </button>
                {error && (
                  <p
                    role="alert"
                    className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-xs text-red-700"
                  >
                    {error}
                  </p>
                )}
              </div>
            )}

            <div className="flex-1 space-y-2.5 overflow-y-auto px-4 py-4">
              {thread.length === 0 ? (
                <div className="space-y-3 py-6">
                  <p className="text-center text-sm text-slate-500">
                    {selectedThreadContext
                      ? "Context is pinned above — pick a suggested opener or write your own."
                      : "No messages yet."}
                  </p>
                  {emptyThreadOpeners.length > 0 ? (
                    <div className="mx-auto flex max-w-md flex-col gap-2">
                      {emptyThreadOpeners.map((opener) => (
                        <button
                          key={opener}
                          type="button"
                          onClick={() => setDraft(opener)}
                          className="rounded-xl border border-teal-200/80 bg-teal-50/50 px-3 py-2 text-left text-xs font-medium text-teal-950 transition hover:bg-teal-50"
                        >
                          {opener}
                        </button>
                      ))}
                    </div>
                  ) : null}
                </div>
              ) : (
                thread.map((message) => {
                  if (isSystemMessage(message)) {
                    return (
                      <div
                        key={message.id}
                        className="flex justify-center px-2 py-1"
                      >
                        <p className="max-w-[min(90%,28rem)] rounded-full bg-slate-100 px-3 py-1.5 text-center text-xs font-medium text-slate-600">
                          {message.content}
                        </p>
                      </div>
                    );
                  }
                  const mine = message.sender_id === currentUserId;
                  return (
                    <div
                      key={message.id}
                      className={`flex max-w-full items-end gap-2 ${
                        mine ? "justify-end self-end" : "justify-start self-start"
                      }`}
                    >
                      {!mine ? (
                        <Avatar
                          name={
                            partnerIsAnonymous
                              ? null
                              : selectedPartner.full_name
                          }
                          url={
                            partnerIsAnonymous
                              ? null
                              : selectedPartner.avatar_url
                          }
                          size="bubble"
                          anonymous={partnerIsAnonymous}
                        />
                      ) : null}
                      <div
                        className={`max-w-[min(74%,22rem)] rounded-[1.125rem] px-3.5 py-2.5 text-[15px] leading-snug ${
                          mine
                            ? "rounded-br-md bg-[var(--brand)] text-white"
                            : "rounded-bl-md border border-teal-900/10 bg-white text-slate-900"
                        }`}
                      >
                        <p className="break-safe whitespace-pre-wrap">
                          {message.content}
                        </p>
                        <p
                          className={`mt-1.5 text-[10px] font-medium ${
                            mine
                              ? "text-right text-white/75"
                              : "text-slate-400"
                          }`}
                          title={formatAbsoluteTime(message.created_at)}
                        >
                          {formatChatBubbleTime(message.created_at)}
                        </p>
                      </div>
                      {mine ? (
                        <Avatar
                          name={currentUserProfile?.full_name ?? null}
                          url={currentUserProfile?.avatar_url ?? null}
                          size="bubble"
                        />
                      ) : null}
                    </div>
                  );
                })
              )}
              <div ref={bottomRef} />
            </div>

            {!isIncomingRequest && (
              <form
                onSubmit={handleSend}
                className="border-t border-teal-900/8 bg-white p-3"
              >
                {error && (
                  <p
                    role="alert"
                    className="mb-2 rounded-lg bg-red-50 px-3 py-2 text-xs text-red-700"
                  >
                    {error}
                  </p>
                )}
                {isLockedForSender ? (
                  <div className="rounded-xl bg-teal-50 px-3.5 py-3 text-center text-sm font-medium text-teal-800">
                    Waiting for {partnerFirst} to accept your request…
                  </div>
                ) : turnGate.isStudent && turnGate.waitingOnMentor ? (
                  <div className="rounded-xl bg-teal-50 px-3.5 py-3 text-center text-sm font-medium text-teal-800">
                    You&apos;ll be able to send another message once{" "}
                    {partnerFirst} replies.
                  </div>
                ) : (
                  <div className="space-y-2">
                    {selectedThreadContext && thread.length === 0 ? (
                      <ConversationContextHeader
                        context={selectedThreadContext}
                        compact
                      />
                    ) : null}
                    {turnGate.isStudent && turnGate.canSend && (
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-xs font-medium text-amber-900">
                          One follow-up question — make it count
                        </p>
                        <p className="text-[11px] text-slate-400">
                          {draft.length}/{TURN_FOLLOWUP_MAX}
                        </p>
                      </div>
                    )}
                    <div className="flex items-end gap-2">
                      <textarea
                        value={draft}
                        onChange={(e) => setDraft(e.target.value)}
                        placeholder="Write a message…"
                        rows={1}
                        maxLength={
                          turnGate.isStudent && turnGate.canSend
                            ? TURN_FOLLOWUP_MAX
                            : undefined
                        }
                        className="max-h-28 min-h-[2.75rem] min-w-0 flex-1 resize-none rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-teal-500 focus:ring-2 focus:ring-teal-500/20"
                      />
                      <button
                        type="submit"
                        disabled={sending || !draft.trim()}
                        className="inline-flex min-h-[2.75rem] min-w-[4.5rem] shrink-0 items-center justify-center rounded-xl bg-[var(--brand)] px-4 text-sm font-bold text-white transition hover:bg-[var(--brand-dark)] disabled:opacity-50"
                      >
                        {sending ? "…" : "Send"}
                      </button>
                    </div>
                  </div>
                )}
              </form>
            )}
          </>
        )}
      </section>

      <ChatSafetySheet
        open={safetyOpen}
        partnerName={partnerFirst === "them" ? partnerName : partnerFirst}
        busy={safetyBusy}
        error={safetyError}
        onClose={() => {
          if (!safetyBusy) {
            setSafetyOpen(false);
            setSafetyError(null);
          }
        }}
        onDisconnect={() => void handleDisconnect()}
        onBlock={() => void handleBlockFromSafety()}
        onReport={(reason, details, alsoBlock) =>
          void handleReport(reason, details, alsoBlock)
        }
      />
    </div>
  );
}

function Avatar({
  name,
  url,
  size = "md",
  anonymous = false,
}: {
  name: string | null;
  url: string | null;
  size?: "sm" | "md" | "bubble";
  anonymous?: boolean;
}) {
  const dim =
    size === "bubble"
      ? "h-[34px] w-[34px] text-[11px]"
      : size === "sm"
        ? "h-8 w-8 text-xs"
        : "h-10 w-10 text-sm";
  if (anonymous) {
    return (
      <div
        aria-hidden
        className={`flex ${dim} shrink-0 items-center justify-center rounded-full bg-slate-200 font-semibold text-slate-600`}
      >
        ?
      </div>
    );
  }
  if (url) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={url}
        alt=""
        className={`${dim} shrink-0 rounded-full object-cover ring-2 ring-teal-100`}
      />
    );
  }
  return (
    <div
      aria-hidden
      className={`flex ${dim} shrink-0 items-center justify-center rounded-full bg-teal-100 font-semibold text-teal-800`}
    >
      {getInitials(name)}
    </div>
  );
}
