export type MessageKind = "user" | "system";

export type Message = {
  id: string;
  sender_id: string;
  receiver_id: string;
  content: string;
  created_at: string;
  read: boolean;
  conversation_id?: string | null;
  is_system?: boolean;
  message_kind?: MessageKind | null;
};

export function isSystemMessage(message: Pick<Message, "is_system" | "message_kind">): boolean {
  return Boolean(message.is_system) || message.message_kind === "system";
}

export type ChatPartner = {
  id: string;
  full_name: string | null;
  avatar_url: string | null;
};

export type Conversation = {
  partner: ChatPartner;
  lastMessage: Message;
  unreadCount: number;
};

export function otherPartyId(message: Message, currentUserId: string): string {
  return message.sender_id === currentUserId
    ? message.receiver_id
    : message.sender_id;
}

/** @deprecated Import from `@/lib/format-time` instead. */
export { formatRelativeTime as formatMessageTime } from "@/lib/format-time";

export function buildConversations(
  messages: Message[],
  partners: Record<string, ChatPartner>,
  currentUserId: string,
): Conversation[] {
  const latestByPartner = new Map<string, Message>();
  const unreadByPartner = new Map<string, number>();

  for (const message of messages) {
    const partnerId = otherPartyId(message, currentUserId);
    const existing = latestByPartner.get(partnerId);
    if (
      !existing ||
      new Date(message.created_at).getTime() >
        new Date(existing.created_at).getTime()
    ) {
      latestByPartner.set(partnerId, message);
    }

    if (
      message.receiver_id === currentUserId &&
      !message.read &&
      !isSystemMessage(message)
    ) {
      unreadByPartner.set(
        partnerId,
        (unreadByPartner.get(partnerId) ?? 0) + 1,
      );
    }
  }

  const conversations: Conversation[] = [];
  for (const [partnerId, lastMessage] of latestByPartner) {
    conversations.push({
      partner: partners[partnerId] ?? {
        id: partnerId,
        full_name: null,
        avatar_url: null,
      },
      lastMessage,
      unreadCount: unreadByPartner.get(partnerId) ?? 0,
    });
  }

  conversations.sort(
    (a, b) =>
      new Date(b.lastMessage.created_at).getTime() -
      new Date(a.lastMessage.created_at).getTime(),
  );

  return conversations;
}
