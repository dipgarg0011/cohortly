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
  mapMessagingError,
  partnerIdFromConversation,
  studentTurnGate,
  TURN_FOLLOWUP_MAX,
  type ConversationRow,
} from "@/lib/conversations";
import {
  formatMessageTime,
  otherPartyId,
  type ChatPartner,
  type Message,
} from "@/lib/messages";

type InboxTab = "chats" | "requests";

type Props = {
  currentUserId: string;
  initialMessages: Message[];
  initialPartners: ChatPartner[];
  initialConversations: ConversationRow[];
  initialWithId: string | null;
};

type ListItem = {
  partner: ChatPartner;
  conversation: ConversationRow;
  lastMessage: Message | null;
  unreadCount: number;
};

export function MessagesInbox({
  currentUserId,
  initialMessages,
  initialPartners,
  initialConversations,
  initialWithId,
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
  const [selectedId, setSelectedId] = useState<string | null>(initialWithId);
  const [tab, setTab] = useState<InboxTab>("chats");
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [responding, setResponding] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [mobileShowChat, setMobileShowChat] = useState(Boolean(initialWithId));
  const bottomRef = useRef<HTMLDivElement>(null);

  const ensurePartner = useCallback(
    async (partnerId: string) => {
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
    [supabase],
  );

  const upsertMessage = useCallback((incoming: Message) => {
    setMessages((prev) => {
      if (prev.some((m) => m.id === incoming.id)) {
        return prev.map((m) => (m.id === incoming.id ? incoming : m));
      }
      return [...prev, incoming];
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
        (c) => c.status === "pending" && c.recipient_id === currentUserId,
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
          (m) => m.receiver_id === currentUserId && !m.read,
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
          (m) => m.receiver_id === currentUserId && !m.read,
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

  const listItems = tab === "chats" ? chatItems : requestItems;

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
    selectedConversation.recipient_id === currentUserId;

  // Open deep-link on the right tab
  useEffect(() => {
    if (!initialWithId) return;
    const conv = conversations.find((c) => {
      const partner = partnerIdFromConversation(c, currentUserId);
      return partner === initialWithId;
    });
    if (conv?.status === "pending" && conv.recipient_id === currentUserId) {
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

  // Realtime: messages + conversations
  useEffect(() => {
    const channel = supabase
      .channel(`messages-inbox:${currentUserId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "messages" },
        (payload) => {
          const row = payload.new as Message;
          if (
            row.sender_id !== currentUserId &&
            row.receiver_id !== currentUserId
          ) {
            return;
          }
          upsertMessage(row);
          void ensurePartner(otherPartyId(row, currentUserId));

          if (
            row.receiver_id === currentUserId &&
            row.sender_id === selectedId
          ) {
            void markConversationRead(row.sender_id);
          }
        },
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "messages" },
        (payload) => {
          const row = payload.new as Message;
          if (
            row.sender_id !== currentUserId &&
            row.receiver_id !== currentUserId
          ) {
            return;
          }
          upsertMessage(row);
        },
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "conversations" },
        (payload) => {
          if (payload.eventType === "DELETE") {
            const old = payload.old as { id?: string };
            if (old.id) {
              setConversations((prev) => prev.filter((c) => c.id !== old.id));
            }
            return;
          }
          const row = payload.new as ConversationRow;
          if (
            row.initiator_id !== currentUserId &&
            row.recipient_id !== currentUserId
          ) {
            return;
          }
          upsertConversation(row);
          void ensurePartner(
            partnerIdFromConversation(row, currentUserId),
          );
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

    const { data, error: insertError } = await supabase
      .from("messages")
      .insert({
        sender_id: currentUserId,
        receiver_id: selectedId,
        content: trimmed,
        read: false,
      })
      .select(
        "id, sender_id, receiver_id, content, created_at, read, conversation_id, is_system",
      )
      .single();

    if (insertError) {
      setError(mapMessagingError(insertError));
      setSending(false);
      return;
    }

    if (data) upsertMessage(data as Message);
    setDraft("");
    setSending(false);
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

  function openConversation(partnerId: string, preferTab?: InboxTab) {
    setSelectedId(partnerId);
    setMobileShowChat(true);
    setError(null);
    if (preferTab) setTab(preferTab);
    router.replace(`/messages?with=${partnerId}`);
  }

  const requestCount = requestItems.length;
  const partnerName =
    selectedPartner?.full_name?.trim() || "Unnamed member";
  const partnerFirst = firstName(selectedPartner?.full_name);

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
                      className="shrink-0"
                    >
                      <Avatar
                        name={item.partner.full_name}
                        url={item.partner.avatar_url}
                      />
                    </ProfilePreviewTrigger>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-2">
                        <ProfilePreviewTrigger
                          userId={item.partner.id}
                          className="min-w-0 truncate"
                        >
                          <span
                            title={name}
                            className="min-w-0 truncate whitespace-nowrap text-sm font-semibold text-slate-900"
                          >
                            {name}
                          </span>
                        </ProfilePreviewTrigger>
                        <span className="shrink-0 text-[11px] text-slate-400">
                          {item.lastMessage
                            ? formatMessageTime(item.lastMessage.created_at)
                            : formatMessageTime(item.conversation.created_at)}
                        </span>
                      </div>
                      <div className="mt-0.5 flex items-center gap-2">
                        <p className="truncate text-xs text-slate-500">
                          {pendingOut
                            ? "Waiting for acceptance…"
                            : item.lastMessage
                              ? `${
                                  item.lastMessage.sender_id === currentUserId
                                    ? "You: "
                                    : ""
                                }${item.lastMessage.content}`
                              : "Connection request"}
                        </p>
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
              <ProfilePreviewTrigger userId={selectedId} className="shrink-0">
                <Avatar
                  name={selectedPartner.full_name}
                  url={selectedPartner.avatar_url}
                  size="sm"
                />
              </ProfilePreviewTrigger>
              <div className="min-w-0 flex-1">
                <ProfilePreviewTrigger userId={selectedId}>
                  <p
                    title={partnerName}
                    className="min-w-0 truncate whitespace-nowrap font-semibold text-slate-900"
                  >
                    {partnerName}
                  </p>
                </ProfilePreviewTrigger>
                {selectedConversation.status === "pending" && (
                  <p className="text-xs text-slate-500">Connection request</p>
                )}
              </div>
            </div>

            {isIncomingRequest && (
              <div className="border-b border-teal-900/8 bg-teal-50/70 px-4 py-4">
                <div className="flex items-start gap-3">
                  <ProfilePreviewTrigger userId={selectedId} className="shrink-0">
                    <Avatar
                      name={selectedPartner.full_name}
                      url={selectedPartner.avatar_url}
                    />
                  </ProfilePreviewTrigger>
                  <div className="min-w-0 flex-1">
                    <p className="break-safe text-sm font-semibold text-slate-900">
                      <ProfilePreviewTrigger userId={selectedId}>
                        {partnerName}
                      </ProfilePreviewTrigger>{" "}
                      wants to connect
                    </p>
                    {thread[0] && (
                      <p className="mt-1 break-safe rounded-xl bg-white px-3 py-2 text-sm text-slate-700 shadow-sm">
                        “{thread[0].content}”
                      </p>
                    )}
                    <div className="mt-3 btn-row">
                      <button
                        type="button"
                        disabled={responding}
                        onClick={() => void handleRespond("accepted")}
                        className="btn-primary disabled:opacity-60"
                      >
                        Accept
                      </button>
                      <button
                        type="button"
                        disabled={responding}
                        onClick={() => void handleRespond("declined")}
                        className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 disabled:opacity-60"
                      >
                        Decline
                      </button>
                      <button
                        type="button"
                        disabled={responding}
                        onClick={() => void handleRespond("blocked")}
                        className="rounded-xl border border-red-200 bg-red-50 px-4 py-2 text-sm font-semibold text-red-700 transition hover:bg-red-100 disabled:opacity-60"
                      >
                        Block
                      </button>
                    </div>
                  </div>
                </div>
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

            <div className="flex-1 space-y-3 overflow-y-auto px-4 py-4">
              {thread.length === 0 ? (
                <p className="py-8 text-center text-sm text-slate-500">
                  No messages yet.
                </p>
              ) : (
                thread.map((message) => {
                  if (message.is_system) {
                    return (
                      <div
                        key={message.id}
                        className="flex justify-center px-2"
                      >
                        <p className="max-w-[min(90%,28rem)] text-center text-xs text-slate-500">
                          {message.content}
                        </p>
                      </div>
                    );
                  }
                  const mine = message.sender_id === currentUserId;
                  return (
                    <div
                      key={message.id}
                      className={`flex ${mine ? "justify-end" : "justify-start"}`}
                    >
                      <div
                        className={`max-w-[min(85%,22rem)] rounded-2xl px-3.5 py-2 text-sm ${
                          mine
                            ? "rounded-br-md bg-[var(--brand)] text-white"
                            : "rounded-bl-md bg-slate-100 text-slate-800"
                        }`}
                      >
                        <p className="break-safe whitespace-pre-wrap">
                          {message.content}
                        </p>
                        <p
                          className={`mt-1 text-[10px] ${
                            mine ? "text-teal-100" : "text-slate-400"
                          }`}
                        >
                          {formatMessageTime(message.created_at)}
                        </p>
                      </div>
                    </div>
                  );
                })
              )}
              <div ref={bottomRef} />
            </div>

            {!isIncomingRequest && (
              <form
                onSubmit={handleSend}
                className="border-t border-teal-900/8 p-3"
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
                  <div className="flex flex-col gap-2 sm:flex-row">
                    <div
                      aria-disabled="true"
                      className="min-w-0 flex-1 cursor-not-allowed break-safe rounded-xl border border-slate-200 bg-slate-100 px-3.5 py-2.5 text-sm text-slate-500"
                    >
                      Waiting for {partnerFirst} to accept your request. You can
                      send more messages once they do.
                    </div>
                    <button
                      type="button"
                      disabled
                      className="btn-primary w-full shrink-0 cursor-not-allowed opacity-40 sm:w-auto"
                    >
                      Send
                    </button>
                  </div>
                ) : turnGate.isStudent && turnGate.waitingOnMentor ? (
                  <div className="flex flex-col gap-2 sm:flex-row">
                    <div
                      aria-disabled="true"
                      className="min-w-0 flex-1 cursor-not-allowed break-safe rounded-xl border border-slate-200 bg-slate-100 px-3.5 py-2.5 text-sm text-slate-500"
                    >
                      You&apos;ll be able to send another message once{" "}
                      {partnerFirst} replies.
                    </div>
                    <button
                      type="button"
                      disabled
                      className="btn-primary w-full shrink-0 cursor-not-allowed opacity-40 sm:w-auto"
                    >
                      Send
                    </button>
                  </div>
                ) : (
                  <div className="space-y-2">
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
                    <div className="flex gap-2">
                      <input
                        type="text"
                        value={draft}
                        onChange={(e) => setDraft(e.target.value)}
                        placeholder="Write a message…"
                        maxLength={
                          turnGate.isStudent && turnGate.canSend
                            ? TURN_FOLLOWUP_MAX
                            : undefined
                        }
                        className="min-w-0 flex-1 rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-teal-500 focus:ring-2 focus:ring-teal-500/20"
                      />
                      <button
                        type="submit"
                        disabled={sending || !draft.trim()}
                        className="btn-primary shrink-0 disabled:opacity-60"
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
    </div>
  );
}

function Avatar({
  name,
  url,
  size = "md",
}: {
  name: string | null;
  url: string | null;
  size?: "sm" | "md";
}) {
  const dim = size === "sm" ? "h-8 w-8 text-xs" : "h-10 w-10 text-sm";
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
