"use client";

import { useMemo, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { ProfileCard } from "@/components/profile-card";
import { ConnectionRequestModal } from "@/components/connection-request-modal";
import { EmptyState } from "@/components/ui/empty-state";
import { IconNetworkEmpty } from "@/components/ui/icons";
import { SurfaceCard } from "@/components/ui/surface-card";
import {
  connectionActionFor,
  findConversationWith,
  type ConversationRow,
} from "@/lib/conversations";
import {
  getProfileRole,
  OPEN_TO_OPTIONS,
  SKILL_OPTIONS,
  type NetworkProfile,
  type ProfileRole,
} from "@/lib/network";

type StatusFilter = "All" | ProfileRole;
type ConnectFilter = "all" | "new" | "pending" | "connected";
type SortMode = "suggested" | "batch" | "name";


type Props = {
  profiles: NetworkProfile[];
  currentUserId: string;
  viewer: NetworkProfile | null;
  initialConversations: ConversationRow[];
};

export function NetworkDirectory({
  profiles,
  currentUserId,
  viewer,
  initialConversations,
}: Props) {
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [batchYear, setBatchYear] = useState("all");
  const [department, setDepartment] = useState("all");
  const [openToFilter, setOpenToFilter] = useState("all");
  const [skillFilter, setSkillFilter] = useState("all");
  const [status, setStatus] = useState<StatusFilter>("All");
  const [connectFilter, setConnectFilter] = useState<ConnectFilter>("all");
  const [foundersOnly, setFoundersOnly] = useState(false);
  const [sortMode, setSortMode] = useState<SortMode>("suggested");
  const [showMoreFilters, setShowMoreFilters] = useState(false);
  const [conversations, setConversations] =
    useState<ConversationRow[]>(initialConversations);
  const [requestTarget, setRequestTarget] = useState<NetworkProfile | null>(
    null,
  );

  const currentYear = new Date().getFullYear();
  const others = useMemo(
    () => profiles.filter((p) => p.id !== currentUserId),
    [profiles, currentUserId],
  );

  const batchYears = useMemo(() => {
    const years = new Set<number>();
    for (const p of others) {
      if (p.batch_year != null) years.add(p.batch_year);
    }
    return Array.from(years).sort((a, b) => b - a);
  }, [others]);

  const departments = useMemo(() => {
    const deps = new Set<string>();
    for (const p of others) {
      if (p.department?.trim()) deps.add(p.department.trim());
    }
    return Array.from(deps).sort((a, b) => a.localeCompare(b));
  }, [others]);

  const skillOptions = useMemo(() => {
    const fromProfiles = new Set<string>(SKILL_OPTIONS);
    for (const p of others) {
      for (const skill of p.skills ?? []) {
        if (skill.trim()) fromProfiles.add(skill.trim());
      }
    }
    return Array.from(fromProfiles).sort((a, b) => a.localeCompare(b));
  }, [others]);

  function connectKind(profileId: string) {
    const conv = findConversationWith(
      conversations,
      currentUserId,
      profileId,
    );
    return connectionActionFor(conv).kind;
  }

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const viewerDept = viewer?.department?.trim().toLowerCase() ?? "";
    const viewerBatch = viewer?.batch_year ?? null;

    const rows = others.filter((profile) => {
      const role = getProfileRole(profile.batch_year, currentYear);
      const haystack = [
        profile.full_name,
        profile.company,
        profile.department,
        profile.role_title,
        profile.current_job,
        profile.bio,
        ...(profile.skills ?? []),
        ...(profile.open_to ?? []),
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();

      if (q && !haystack.includes(q)) return false;
      if (batchYear !== "all" && String(profile.batch_year) !== batchYear) {
        return false;
      }
      if (
        department !== "all" &&
        (profile.department?.trim() ?? "") !== department
      ) {
        return false;
      }
      if (
        openToFilter !== "all" &&
        !(profile.open_to ?? []).includes(openToFilter)
      ) {
        return false;
      }
      if (
        skillFilter !== "all" &&
        !(profile.skills ?? []).includes(skillFilter)
      ) {
        return false;
      }
      if (foundersOnly && !profile.is_founder) return false;
      if (status !== "All" && role !== status) return false;

      const kind = connectKind(profile.id);
      if (connectFilter === "new" && kind !== "send_request") return false;
      if (connectFilter === "pending" && kind !== "request_sent") return false;
      if (connectFilter === "connected" && kind !== "message") return false;
      if (kind === "hidden") return false;

      return true;
    });

    function score(profile: NetworkProfile) {
      let s = 0;
      const dept = profile.department?.trim().toLowerCase() ?? "";
      if (viewerDept && dept === viewerDept) s += 4;
      if (viewerBatch != null && profile.batch_year === viewerBatch) s += 3;
      if ((profile.open_to ?? []).length > 0) s += 2;
      if (profile.is_founder) s += 1;
      if ((profile.skills ?? []).length > 0) s += 1;
      if (connectKind(profile.id) === "send_request") s += 1;
      return s;
    }

    rows.sort((a, b) => {
      if (sortMode === "name") {
        return (a.full_name ?? "").localeCompare(b.full_name ?? "");
      }
      if (sortMode === "batch") {
        const by = (b.batch_year ?? 0) - (a.batch_year ?? 0);
        if (by !== 0) return by;
        return (a.full_name ?? "").localeCompare(b.full_name ?? "");
      }
      const diff = score(b) - score(a);
      if (diff !== 0) return diff;
      return (a.full_name ?? "").localeCompare(b.full_name ?? "");
    });

    return rows;
    // eslint-disable-next-line react-hooks/exhaustive-deps -- connectKind uses conversations
  }, [
    others,
    search,
    batchYear,
    department,
    openToFilter,
    skillFilter,
    status,
    connectFilter,
    foundersOnly,
    sortMode,
    currentYear,
    viewer,
    conversations,
    currentUserId,
  ]);

  const activeFilterCount = [
    batchYear !== "all",
    department !== "all",
    openToFilter !== "all",
    skillFilter !== "all",
    status !== "All",
    connectFilter !== "all",
    foundersOnly,
  ].filter(Boolean).length;

  function clearFilters() {
    setSearch("");
    setBatchYear("all");
    setDepartment("all");
    setOpenToFilter("all");
    setSkillFilter("all");
    setStatus("All");
    setConnectFilter("all");
    setFoundersOnly(false);
    setSortMode("suggested");
  }

  function actionProps(profile: NetworkProfile) {
    const conv = findConversationWith(
      conversations,
      currentUserId,
      profile.id,
    );
    const action = connectionActionFor(conv);

    if (action.kind === "hidden") {
      return { onSayHi: undefined as (() => void) | undefined };
    }
    if (action.kind === "message") {
      return {
        onSayHi: () => router.push(`/messages?with=${profile.id}`),
        sayHiLabel: "Message",
        sayHiDisabled: false,
      };
    }
    if (action.kind === "request_sent") {
      return {
        onSayHi: () => undefined,
        sayHiLabel: "Request sent",
        sayHiDisabled: true,
      };
    }
    return {
      onSayHi: () => setRequestTarget(profile),
      sayHiLabel: "Connect",
      sayHiDisabled: false,
    };
  }

  const quickOpenTo = OPEN_TO_OPTIONS.filter((t) =>
    ["Mentoring", "Referrals", "Hiring", "Networking"].includes(t),
  );

  return (
    <div className="space-y-5">
      <SurfaceCard className="space-y-4 p-4 sm:sticky sm:top-16 sm:z-20 sm:p-5">
        <label className="relative block">
          <span className="sr-only">Search people</span>
          <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400">
            <SearchIcon />
          </span>
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search name, company, department, or skill…"
            className="w-full rounded-xl border border-slate-200 bg-white py-3 pl-10 pr-3.5 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-sky-500 focus:ring-2 focus:ring-sky-500/20"
          />
        </label>

        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-semibold uppercase tracking-wide text-slate-400">
            Who
          </span>
          {(
            [
              ["All", "Everyone"],
              ["Student", "Students"],
              ["Graduate", "Graduates"],
            ] as const
          ).map(([value, label]) => (
            <Chip
              key={value}
              active={status === value}
              onClick={() => setStatus(value)}
            >
              {label}
            </Chip>
          ))}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-semibold uppercase tracking-wide text-slate-400">
            Open to
          </span>
          <Chip
            active={openToFilter === "all"}
            onClick={() => setOpenToFilter("all")}
          >
            Any
          </Chip>
          {quickOpenTo.map((tag) => (
            <Chip
              key={tag}
              active={openToFilter === tag}
              onClick={() =>
                setOpenToFilter((prev) => (prev === tag ? "all" : tag))
              }
            >
              {tag}
            </Chip>
          ))}
          <Chip
            active={foundersOnly}
            onClick={() => setFoundersOnly((v) => !v)}
          >
            Founders
          </Chip>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-semibold uppercase tracking-wide text-slate-400">
            Status
          </span>
          {(
            [
              ["all", "All"],
              ["new", "Not connected"],
              ["pending", "Requested"],
              ["connected", "Connected"],
            ] as const
          ).map(([value, label]) => (
            <Chip
              key={value}
              active={connectFilter === value}
              onClick={() => setConnectFilter(value)}
            >
              {label}
            </Chip>
          ))}
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3">
          <button
            type="button"
            onClick={() => setShowMoreFilters((v) => !v)}
            className="text-sm font-bold text-sky-700 hover:underline"
          >
            {showMoreFilters ? "Hide filters" : "More filters"}
            {activeFilterCount > 0 && !showMoreFilters
              ? ` (${activeFilterCount})`
              : ""}
          </button>
          <div className="flex flex-wrap items-center gap-2">
            <label className="flex items-center gap-2 text-sm text-slate-600">
              <span className="text-xs font-semibold uppercase tracking-wide text-slate-400">
                Sort
              </span>
              <select
                value={sortMode}
                onChange={(e) => setSortMode(e.target.value as SortMode)}
                className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-sm outline-none focus:border-sky-500 focus:ring-2 focus:ring-sky-500/20"
              >
                <option value="suggested">Suggested for you</option>
                <option value="batch">Batch year</option>
                <option value="name">Name A–Z</option>
              </select>
            </label>
            {(activeFilterCount > 0 || search.trim()) && (
              <button
                type="button"
                onClick={clearFilters}
                className="rounded-lg px-2.5 py-1.5 text-sm font-semibold text-slate-600 hover:bg-slate-100"
              >
                Clear all
              </button>
            )}
          </div>
        </div>

        {showMoreFilters && (
          <div className="grid gap-3 border-t border-slate-100 pt-4 sm:grid-cols-3">
            <FilterSelect
              label="Batch year"
              value={batchYear}
              onChange={setBatchYear}
            >
              <option value="all">All years</option>
              {batchYears.map((year) => (
                <option key={year} value={year}>
                  {year}
                </option>
              ))}
            </FilterSelect>

            <FilterSelect
              label="Department"
              value={department}
              onChange={setDepartment}
            >
              <option value="all">All departments</option>
              {departments.map((dep) => (
                <option key={dep} value={dep}>
                  {dep}
                </option>
              ))}
            </FilterSelect>

            <FilterSelect
              label="Skill"
              value={skillFilter}
              onChange={setSkillFilter}
            >
              <option value="all">All skills</option>
              {skillOptions.map((skill) => (
                <option key={skill} value={skill}>
                  {skill}
                </option>
              ))}
            </FilterSelect>
          </div>
        )}
      </SurfaceCard>

      <div className="flex items-center justify-between gap-3 px-0.5">
        <p className="text-sm font-semibold text-slate-700">
          {filtered.length === 0
            ? "No people found"
            : `${filtered.length} ${filtered.length === 1 ? "person" : "people"}`}
        </p>
        {viewer?.department?.trim() && sortMode === "suggested" && (
          <p className="text-xs text-slate-500">
            Prioritizing {viewer.department.trim()}
            {viewer.batch_year != null ? ` · batch ${viewer.batch_year}` : ""}
          </p>
        )}
      </div>

      {filtered.length === 0 ? (
        <EmptyState
          icon={<IconNetworkEmpty />}
          title="Nobody matches that search"
          description="Try another name, clear a filter, or browse everyone in the community."
          actionLabel="Clear filters"
          onAction={clearFilters}
          accentSoft="var(--accent-network-soft)"
        />
      ) : (
        <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((profile) => {
            const props = actionProps(profile);
            const sameDept =
              !!viewer?.department?.trim() &&
              profile.department?.trim() === viewer.department.trim();
            const sameBatch =
              viewer?.batch_year != null &&
              profile.batch_year === viewer.batch_year;
            return (
              <li key={profile.id}>
                <ProfileCard
                  profile={profile}
                  currentYear={currentYear}
                  onSayHi={props.onSayHi}
                  sayHiLabel={props.sayHiLabel}
                  sayHiDisabled={props.sayHiDisabled}
                  hint={
                    sameDept && sameBatch
                      ? "Same department & batch"
                      : sameDept
                        ? "Same department"
                        : sameBatch
                          ? "Same batch"
                          : undefined
                  }
                />
              </li>
            );
          })}
        </ul>
      )}

      {requestTarget && (
        <ConnectionRequestModal
          open
          onClose={() => setRequestTarget(null)}
          currentUserId={currentUserId}
          recipientId={requestTarget.id}
          recipientName={requestTarget.full_name}
          onSent={(recipientId) => {
            setConversations((prev) => {
              if (findConversationWith(prev, currentUserId, recipientId)) {
                return prev.map((c) => {
                  const match =
                    (c.initiator_id === currentUserId &&
                      c.recipient_id === recipientId) ||
                    (c.initiator_id === recipientId &&
                      c.recipient_id === currentUserId);
                  return match
                    ? {
                        ...c,
                        status: "pending" as const,
                        intro_message_sent: true,
                      }
                    : c;
                });
              }
              return [
                ...prev,
                {
                  id: `local-${recipientId}`,
                  initiator_id: currentUserId,
                  recipient_id: recipientId,
                  status: "pending",
                  unlock_reason: null,
                  intro_message_sent: true,
                  created_at: new Date().toISOString(),
                  updated_at: new Date().toISOString(),
                },
              ];
            });
            setRequestTarget(null);
            router.push(`/messages?with=${recipientId}`);
          }}
        />
      )}
    </div>
  );
}

function Chip({
  active,
  onClick,
  children,
  className = "",
}: {
  active: boolean;
  onClick: () => void;
  children: ReactNode;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-full px-3 py-1.5 text-xs font-bold transition sm:text-sm ${
        active
          ? "bg-sky-600 text-white shadow-sm"
          : "bg-slate-100 text-slate-700 hover:bg-slate-200"
      } ${className}`}
    >
      {children}
    </button>
  );
}

function FilterSelect({
  label,
  value,
  onChange,
  children,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  children: ReactNode;
}) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-xs font-medium text-slate-500">{label}</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none transition focus:border-sky-500 focus:ring-2 focus:ring-sky-500/20"
      >
        {children}
      </select>
    </label>
  );
}

function SearchIcon() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="h-4 w-4"
      aria-hidden
    >
      <circle cx="11" cy="11" r="7" />
      <path d="m20 20-3.5-3.5" />
    </svg>
  );
}
