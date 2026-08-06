"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { useRouter } from "next/navigation";
import { ProfileCard } from "@/components/profile-card";
import { ConnectionRequestModal } from "@/components/connection-request-modal";
import { EmptyState } from "@/components/ui/empty-state";
import { SectionCard } from "@/components/ui/section-card";
import { IconNetworkEmpty } from "@/components/ui/icons";
import {
  connectionActionFor,
  findConversationWith,
  type ConversationRow,
} from "@/lib/conversations";
import {
  FALLBACK_DEPARTMENTS,
  formatDepartmentLabel,
  formatDepartmentDisplay,
} from "@/lib/departments";
import {
  getProfileRole,
  OPEN_TO_OPTIONS,
  SKILL_OPTIONS,
  type NetworkProfile,
  type ProfileRole,
} from "@/lib/network";

type StatusFilter = "All" | ProfileRole;

export type NetworkInitialFilters = {
  batchYear?: string;
  department?: string;
  status?: StatusFilter;
};

type Props = {
  profiles: NetworkProfile[];
  currentUserId: string;
  initialConversations: ConversationRow[];
  initialFilters?: NetworkInitialFilters;
};

function syncNetworkUrl(filters: {
  batchYear: string;
  department: string;
  status: StatusFilter;
}) {
  if (typeof window === "undefined") return;
  const params = new URLSearchParams();
  if (filters.batchYear !== "all") params.set("batch", filters.batchYear);
  if (filters.department !== "all") params.set("dept", filters.department);
  if (filters.status === "Student") params.set("status", "student");
  if (filters.status === "Graduate") params.set("status", "graduate");
  const qs = params.toString();
  const next = qs ? `/network?${qs}` : "/network";
  const current = `${window.location.pathname}${window.location.search}`;
  if (current !== next) {
    window.history.replaceState(null, "", next);
  }
}

export function NetworkDirectory({
  profiles,
  currentUserId,
  initialConversations,
  initialFilters,
}: Props) {
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [batchYear, setBatchYear] = useState(
    initialFilters?.batchYear ?? "all",
  );
  const [department, setDepartment] = useState(
    initialFilters?.department ?? "all",
  );
  const [openToFilter, setOpenToFilter] = useState("all");
  const [skillFilter, setSkillFilter] = useState("all");
  const [status, setStatus] = useState<StatusFilter>(
    initialFilters?.status ?? "All",
  );
  const [conversations, setConversations] =
    useState<ConversationRow[]>(initialConversations);
  const [requestTarget, setRequestTarget] = useState<NetworkProfile | null>(
    null,
  );

  const currentYear = new Date().getFullYear();

  useEffect(() => {
    syncNetworkUrl({ batchYear, department, status });
  }, [batchYear, department, status]);

  const clearActiveFilters = useCallback(() => {
    setBatchYear("all");
    setDepartment("all");
    setStatus("All");
  }, []);

  const others = useMemo(
    () => profiles.filter((p) => p.id !== currentUserId),
    [profiles, currentUserId],
  );

  const batchYears = useMemo(() => {
    const years = new Set<number>();
    for (const p of others) {
      if (p.batch_year != null) years.add(p.batch_year);
    }
    // Keep deep-linked year visible even if empty after exclude-self.
    if (batchYear !== "all") {
      const y = Number(batchYear);
      if (Number.isFinite(y)) years.add(y);
    }
    return Array.from(years).sort((a, b) => b - a);
  }, [others, batchYear]);

  const departments = FALLBACK_DEPARTMENTS;

  const skillOptions = useMemo(() => {
    const fromProfiles = new Set<string>(SKILL_OPTIONS);
    for (const p of others) {
      for (const skill of p.skills ?? []) {
        if (skill.trim()) fromProfiles.add(skill.trim());
      }
    }
    return Array.from(fromProfiles).sort((a, b) => a.localeCompare(b));
  }, [others]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();

    return others.filter((profile) => {
      const role = getProfileRole(profile.status);
      const name = profile.full_name?.toLowerCase() ?? "";
      const company = profile.company?.toLowerCase() ?? "";

      if (q && !name.includes(q) && !company.includes(q)) return false;
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
      if (status !== "All" && role !== status) return false;

      return true;
    });
  }, [
    others,
    search,
    batchYear,
    department,
    openToFilter,
    skillFilter,
    status,
  ]);

  // Resolve Message / Request sent / Send Request for every visible card from one list.
  const actionById = useMemo(() => {
    const map: Record<
      string,
      {
        onSayHi?: () => void;
        sayHiLabel?: string;
        sayHiDisabled?: boolean;
        hidden?: boolean;
      }
    > = {};
    for (const profile of filtered) {
      const conv = findConversationWith(
        conversations,
        currentUserId,
        profile.id,
      );
      const action = connectionActionFor(conv);
      if (action.kind === "hidden") {
        map[profile.id] = { hidden: true };
      } else if (action.kind === "message") {
        map[profile.id] = {
          onSayHi: () => router.push(`/messages?with=${profile.id}`),
          sayHiLabel: "Message",
          sayHiDisabled: false,
        };
      } else if (action.kind === "request_sent") {
        map[profile.id] = {
          onSayHi: () => undefined,
          sayHiLabel: "Request sent",
          sayHiDisabled: true,
        };
      } else {
        map[profile.id] = {
          onSayHi: () => setRequestTarget(profile),
          sayHiLabel: "Send Request",
          sayHiDisabled: false,
        };
      }
    }
    return map;
  }, [filtered, conversations, currentUserId, router]);

  // Declined / blocked: omit from the directory (same as suggestions).
  const visible = useMemo(
    () => filtered.filter((p) => !actionById[p.id]?.hidden),
    [filtered, actionById],
  );

  const activeChips: { key: string; label: string; onClear: () => void }[] =
    [];
  if (batchYear !== "all") {
    activeChips.push({
      key: "batch",
      label: `Batch ${batchYear}`,
      onClear: () => setBatchYear("all"),
    });
  }
  if (department !== "all") {
    activeChips.push({
      key: "dept",
      label: formatDepartmentDisplay(department),
      onClear: () => setDepartment("all"),
    });
  }
  if (status !== "All") {
    activeChips.push({
      key: "status",
      label: status === "Student" ? "Students" : "Graduates",
      onClear: () => setStatus("All"),
    });
  }

  return (
    <div className="space-y-6 min-w-0">
      <SectionCard className="space-y-3">
        {activeChips.length > 0 ? (
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            <span className="text-xs font-medium text-slate-500">
              Active filters
            </span>
            {activeChips.map((chip) => (
              <button
                key={chip.key}
                type="button"
                onClick={chip.onClear}
                className="inline-flex min-h-9 items-center gap-1.5 rounded-full border border-teal-200 bg-teal-50 px-3 text-xs font-semibold text-teal-900 transition hover:bg-teal-100"
                aria-label={`Remove filter ${chip.label}`}
              >
                <span className="max-w-[12rem] truncate">{chip.label}</span>
                <span aria-hidden className="text-teal-700/70">
                  ×
                </span>
              </button>
            ))}
            {activeChips.length > 1 ? (
              <button
                type="button"
                onClick={clearActiveFilters}
                className="text-xs font-semibold text-[var(--brand)] hover:underline"
              >
                Clear all
              </button>
            ) : null}
          </div>
        ) : null}

        <label className="block min-w-0">
          <span className="sr-only">Search by name or company</span>
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by name or company…"
            className="w-full min-w-0 rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-teal-500 focus:ring-2 focus:ring-teal-500/20"
          />
        </label>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
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
              <option key={dep.short_code} value={dep.short_code}>
                {formatDepartmentLabel(dep)}
              </option>
            ))}
          </FilterSelect>

          <FilterSelect
            label="Open to"
            value={openToFilter}
            onChange={setOpenToFilter}
          >
            <option value="all">Anything</option>
            {OPEN_TO_OPTIONS.map((tag) => (
              <option key={tag} value={tag}>
                {tag}
              </option>
            ))}
          </FilterSelect>

          <FilterSelect
            label="Skills / interests"
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

        <div className="flex flex-col gap-1 sm:max-w-md">
          <span className="text-xs font-medium text-slate-500">Show</span>
          <div
            className="grid grid-cols-3 gap-1 rounded-xl bg-teal-50 p-1"
            role="tablist"
            aria-label="Status filter"
          >
            {(["All", "Student", "Graduate"] as const).map((option) => {
              const label =
                option === "Student"
                  ? "Students"
                  : option === "Graduate"
                    ? "Graduates"
                    : "All";
              const active = status === option;
              return (
                <button
                  key={option}
                  type="button"
                  role="tab"
                  aria-selected={active}
                  onClick={() => setStatus(option)}
                  className={`min-w-0 truncate rounded-lg px-1.5 py-2 text-[11px] font-semibold transition sm:px-2 sm:text-sm ${
                    active
                      ? "bg-white text-teal-900 shadow-sm"
                      : "text-teal-700/70 hover:text-teal-900"
                  }`}
                >
                  <span className="truncate">{label}</span>
                </button>
              );
            })}
          </div>
        </div>
      </SectionCard>

      {visible.length === 0 ? (
        <EmptyState
          icon={<IconNetworkEmpty />}
          title="Nobody matches that search"
          description="Try another name, clear a filter, or browse everyone in the community."
          actionLabel="Clear filters"
          onAction={() => {
            setSearch("");
            setBatchYear("all");
            setDepartment("all");
            setOpenToFilter("all");
            setSkillFilter("all");
            setStatus("All");
          }}
          accentSoft="var(--accent-network-soft)"
        />
      ) : (
        <ul className="grid w-full min-w-0 max-w-full grid-cols-1 gap-4 overflow-x-clip sm:grid-cols-2 lg:grid-cols-3">
          {visible.map((profile) => {
            const props = actionById[profile.id];
            return (
              <li key={profile.id} className="min-w-0 max-w-full overflow-hidden">
                <ProfileCard
                  profile={profile}
                  currentYear={currentYear}
                  onSayHi={props?.onSayHi}
                  sayHiLabel={props?.sayHiLabel}
                  sayHiDisabled={props?.sayHiDisabled}
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
              if (
                findConversationWith(prev, currentUserId, recipientId)
              ) {
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
    <label className="flex min-w-0 flex-col gap-1">
      <span className="text-xs font-medium text-slate-500">{label}</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full min-w-0 rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none transition focus:border-teal-500 focus:ring-2 focus:ring-teal-500/20"
      >
        {children}
      </select>
    </label>
  );
}
