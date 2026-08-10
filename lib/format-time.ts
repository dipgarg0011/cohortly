/**
 * Shared user-facing time formatting (viewer local timezone).
 * Use formatRelativeTime for display text and formatAbsoluteTime for title/hover.
 */

function parseDate(iso: string): Date | null {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  return date;
}

function startOfLocalDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

/** Full date + time for hover tooltips (`title` attribute). */
export function formatAbsoluteTime(iso: string): string {
  const date = parseDate(iso);
  if (!date) return "";
  return date.toLocaleString(undefined, {
    weekday: "short",
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

/**
 * Relative / compact absolute label in the viewer's local timezone:
 * - under 1 min: "just now"
 * - under 1 hour: "5m ago"
 * - today: "7:02 AM"
 * - yesterday: "Yesterday"
 * - within a week: "Tuesday"
 * - older: "Aug 2"
 */
export function formatRelativeTime(iso: string, now = new Date()): string {
  const date = parseDate(iso);
  if (!date) return "";

  const diffMs = now.getTime() - date.getTime();
  const diffSec = Math.floor(diffMs / 1000);

  if (diffSec < 60) return "just now";

  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m ago`;

  const todayStart = startOfLocalDay(now);
  const dateStart = startOfLocalDay(date);

  if (dateStart.getTime() === todayStart.getTime()) {
    return date.toLocaleTimeString(undefined, {
      hour: "numeric",
      minute: "2-digit",
    });
  }

  const yesterdayStart = new Date(todayStart);
  yesterdayStart.setDate(todayStart.getDate() - 1);
  if (dateStart.getTime() === yesterdayStart.getTime()) {
    return "Yesterday";
  }

  const weekAgo = new Date(todayStart);
  weekAgo.setDate(todayStart.getDate() - 6);
  if (dateStart.getTime() >= weekAgo.getTime()) {
    return date.toLocaleDateString(undefined, { weekday: "long" });
  }

  return date.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
}

/** @deprecated Prefer formatRelativeTime — kept as alias for call-site migration. */
export const formatMessageTime = formatRelativeTime;

/**
 * Compact chat-bubble timestamp (matches mobile):
 * today → "7:02 AM"; older → "Aug 2".
 */
export function formatChatBubbleTime(iso: string, now = new Date()): string {
  const date = parseDate(iso);
  if (!date) return "";

  const sameDay =
    date.getFullYear() === now.getFullYear() &&
    date.getMonth() === now.getMonth() &&
    date.getDate() === now.getDate();

  if (sameDay) {
    return date.toLocaleTimeString(undefined, {
      hour: "numeric",
      minute: "2-digit",
    });
  }

  return date.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
}
