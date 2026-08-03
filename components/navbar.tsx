"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { signOut } from "@/app/auth/actions";
import { createClient } from "@/lib/supabase/client";
import { getInitials } from "@/lib/network";
import {
  IconBriefcase,
  IconHome,
  IconMentor,
  IconMessage,
  IconReferral,
  IconUser,
  IconUsers,
} from "@/components/ui/icons";

const PRIMARY_LINKS = [
  { href: "/dashboard", label: "Home", Icon: IconHome },
  { href: "/network", label: "Network", Icon: IconUsers },
  { href: "/mentors", label: "Mentors", Icon: IconMentor },
  { href: "/referrals", label: "Referrals", Icon: IconReferral },
  { href: "/opportunities", label: "Opportunities", Icon: IconBriefcase },
] as const;

export function Navbar() {
  const pathname = usePathname();
  const supabase = useMemo(() => createClient(), []);
  const [userId, setUserId] = useState<string | null>(null);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [fullName, setFullName] = useState<string | null>(null);
  const [unreadCount, setUnreadCount] = useState(0);
  const [menuOpen, setMenuOpen] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (cancelled || !user) return;
      setUserId(user.id);

      const [{ count }, { data: profile }] = await Promise.all([
        supabase
          .from("messages")
          .select("id", { count: "exact", head: true })
          .eq("receiver_id", user.id)
          .eq("read", false),
        supabase
          .from("profiles")
          .select("full_name, avatar_url")
          .eq("id", user.id)
          .maybeSingle(),
      ]);

      if (!cancelled) {
        setUnreadCount(count ?? 0);
        setFullName(profile?.full_name ?? null);
        setAvatarUrl(profile?.avatar_url ?? null);
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [supabase, pathname]);

  useEffect(() => {
    if (!userId) return;

    const channel = supabase
      .channel(`nav-unread:${userId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "messages" },
        (payload) => {
          const row = payload.new as { receiver_id: string; read: boolean };
          if (row.receiver_id === userId && !row.read) {
            setUnreadCount((n) => n + 1);
          }
        },
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "messages" },
        () => {
          void supabase
            .from("messages")
            .select("id", { count: "exact", head: true })
            .eq("receiver_id", userId)
            .eq("read", false)
            .then(({ count }) => setUnreadCount(count ?? 0));
        },
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [supabase, userId]);

  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      if (!menuRef.current?.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    }
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, []);

  useEffect(() => {
    setMobileOpen(false);
    setMenuOpen(false);
  }, [pathname]);

  const messagesActive =
    pathname === "/messages" || pathname.startsWith("/messages/");

  return (
    <header className="sticky top-0 z-30 overflow-x-clip border-b border-teal-900/8 bg-white/80 backdrop-blur-xl">
      <div className="mx-auto flex h-14 w-full min-w-0 max-w-6xl items-center gap-2 px-3 sm:h-16 sm:gap-3 sm:px-6">
        <Link
          href="/dashboard"
          className="min-w-0 shrink-0 truncate font-[family-name:var(--font-display)] text-lg font-bold tracking-tight text-[var(--brand)] sm:text-xl"
        >
          Cohortly
        </Link>

        <nav
          className="ml-1 hidden min-w-0 flex-1 items-center gap-0.5 lg:flex"
          aria-label="Main"
        >
          {PRIMARY_LINKS.map(({ href, label, Icon }) => {
            const active =
              pathname === href || pathname.startsWith(`${href}/`);
            return (
              <Link
                key={href}
                href={href}
                className={`group relative flex items-center gap-1.5 rounded-xl px-2.5 py-2 text-sm font-semibold transition xl:px-3 ${
                  active
                    ? "text-[var(--brand)]"
                    : "text-slate-500 hover:text-slate-800"
                }`}
              >
                <Icon
                  size={16}
                  className={active ? "opacity-100" : "opacity-70 group-hover:opacity-100"}
                />
                <span className="whitespace-nowrap">{label}</span>
                <span
                  className={`absolute inset-x-2.5 -bottom-0.5 h-0.5 rounded-full bg-[var(--brand)] transition xl:inset-x-3 ${
                    active ? "opacity-100 scale-x-100" : "opacity-0 scale-x-50"
                  }`}
                />
              </Link>
            );
          })}
        </nav>

        <div className="ml-auto flex min-w-0 items-center gap-0.5 sm:gap-1.5">
          <Link
            href="/messages"
            aria-label="Messages"
            className={`relative rounded-xl p-2 transition sm:p-2.5 ${
              messagesActive
                ? "bg-teal-50 text-[var(--brand)]"
                : "text-slate-500 hover:bg-slate-50 hover:text-slate-800"
            }`}
          >
            <IconMessage size={18} />
            {unreadCount > 0 && (
              <span className="absolute right-1 top-1 inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-[var(--brand)] px-1 text-[10px] font-bold text-white">
                {unreadCount > 9 ? "9+" : unreadCount}
              </span>
            )}
          </Link>

          <div className="relative" ref={menuRef}>
            <button
              type="button"
              onClick={() => setMenuOpen((v) => !v)}
              className="flex max-w-[9.5rem] items-center gap-2 rounded-xl p-1.5 sm:pr-2 transition hover:bg-slate-50"
              aria-expanded={menuOpen}
              aria-haspopup="menu"
            >
              {avatarUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={avatarUrl}
                  alt=""
                  className="h-8 w-8 shrink-0 rounded-full object-cover ring-2 ring-teal-100"
                />
              ) : (
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-teal-100 text-xs font-bold text-teal-800">
                  {getInitials(fullName)}
                </span>
              )}
              <span className="hidden min-w-0 truncate text-sm font-semibold text-slate-700 sm:inline">
                {fullName?.split(" ")[0] || "You"}
              </span>
            </button>

            {menuOpen && (
              <div
                role="menu"
                className="absolute right-0 z-40 mt-2 w-48 max-w-[calc(100vw-2rem)] overflow-hidden rounded-2xl border border-teal-900/10 bg-white py-1 shadow-[0_20px_40px_-20px_rgba(15,23,42,0.35)] animate-fade-up"
              >
                <Link
                  href="/profile"
                  role="menuitem"
                  className="flex items-center gap-2 px-3 py-2.5 text-sm font-semibold text-slate-700 hover:bg-teal-50"
                >
                  <IconUser size={15} />
                  Profile
                </Link>
                <Link
                  href="/messages"
                  role="menuitem"
                  className="flex items-center gap-2 px-3 py-2.5 text-sm font-semibold text-slate-700 hover:bg-teal-50"
                >
                  <IconMessage size={15} />
                  Messages
                  {unreadCount > 0 && (
                    <span className="ml-auto rounded-full bg-teal-100 px-1.5 text-[10px] font-bold text-teal-800">
                      {unreadCount}
                    </span>
                  )}
                </Link>
                <div className="my-1 h-px bg-slate-100" />
                <form action={signOut}>
                  <button
                    type="submit"
                    role="menuitem"
                    className="flex w-full items-center gap-2 px-3 py-2.5 text-left text-sm font-semibold text-slate-600 hover:bg-slate-50"
                  >
                    Sign out
                  </button>
                </form>
              </div>
            )}
          </div>

          <button
            type="button"
            className="rounded-xl p-2 text-slate-600 hover:bg-slate-50 lg:hidden"
            aria-label={mobileOpen ? "Close menu" : "Open menu"}
            aria-expanded={mobileOpen}
            onClick={() => setMobileOpen((v) => !v)}
          >
            {mobileOpen ? (
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M6 6l12 12M18 6L6 18" />
              </svg>
            ) : (
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M4 7h16M4 12h16M4 17h16" />
              </svg>
            )}
          </button>
        </div>
      </div>

      {mobileOpen && (
        <nav
          className="max-h-[min(70vh,28rem)] overflow-y-auto border-t border-teal-900/8 bg-white px-3 py-3 sm:px-4 lg:hidden"
          aria-label="Mobile"
        >
          <div className="grid grid-cols-1 gap-1 sm:grid-cols-2">
            {PRIMARY_LINKS.map(({ href, label, Icon }) => {
              const active =
                pathname === href || pathname.startsWith(`${href}/`);
              return (
                <Link
                  key={href}
                  href={href}
                  className={`flex min-w-0 items-center gap-2 rounded-xl px-3 py-2.5 text-sm font-semibold ${
                    active
                      ? "bg-teal-50 text-[var(--brand)]"
                      : "text-slate-600 hover:bg-slate-50"
                  }`}
                >
                  <Icon size={16} className="shrink-0" />
                  <span className="truncate">{label}</span>
                </Link>
              );
            })}
          </div>
        </nav>
      )}
    </header>
  );
}
