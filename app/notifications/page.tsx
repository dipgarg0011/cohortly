import { requireProfile } from "@/lib/require-profile";
import { Navbar } from "@/components/navbar";
import { NotificationsInbox } from "@/components/notifications-inbox";
import { PageShell, PageHeader } from "@/components/ui/page-shell";
import { fetchNotifications } from "@/lib/notifications";

export default async function NotificationsPage() {
  const { supabase, user } = await requireProfile();
  let initialItems: Awaited<ReturnType<typeof fetchNotifications>> = [];
  let loadError: string | null = null;

  try {
    initialItems = await fetchNotifications(supabase, user.id);
  } catch (err) {
    loadError =
      err instanceof Error ? err.message : "Could not load notifications";
  }

  return (
    <PageShell accent="messages">
      <Navbar />
      <main className="relative z-10 mx-auto w-full min-w-0 max-w-3xl flex-1 overflow-x-clip px-3 py-5 sm:px-6 sm:py-8">
        <PageHeader
          accent="messages"
          eyebrow="Inbox"
          title="Notifications"
          description="Requests, messages, applications, and other updates that need you."
        />

        {loadError ? (
          <div className="surface-card border-red-200 bg-red-50 px-5 py-4 text-sm text-red-700">
            {loadError}. If you just added notifications, make sure the Aug 10
            SQL migrations have been run in Supabase.
          </div>
        ) : (
          <NotificationsInbox userId={user.id} initialItems={initialItems} />
        )}
      </main>
    </PageShell>
  );
}
