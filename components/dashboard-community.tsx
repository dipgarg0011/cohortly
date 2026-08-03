"use client";

import { useState } from "react";
import Link from "next/link";
import { SectionCard } from "@/components/ui/section-card";
import { SectionHeader } from "@/components/ui/section-header";
import { IconUsers } from "@/components/ui/icons";
import { getInitials } from "@/lib/network";
import { accentFromId } from "@/lib/accent-from-id";
import type {
  CommunityBatchGroup,
  CommunityDeptGroup,
  CommunityStats,
} from "@/lib/dashboard-community";

type Tab = "batch" | "branch";

type Props = {
  stats: CommunityStats;
};

const VISIBLE_CAP = 8;

export function DashboardCommunity({ stats }: Props) {
  const [tab, setTab] = useState<Tab>("batch");
  const [expanded, setExpanded] = useState(false);

  const groups = tab === "batch" ? stats.batches : stats.departments;
  const showMoreControl = groups.length >= 3;
  const visible =
    showMoreControl && !expanded ? groups.slice(0, VISIBLE_CAP) : groups;
  const hiddenCount = showMoreControl
    ? Math.max(0, groups.length - VISIBLE_CAP)
    : 0;

  const emptyGroups = groups.length === 0;

  return (
    <SectionCard stagger={2} className="mb-5 sm:mb-6">
      <SectionHeader
        title="Explore the community"
        accent="home"
        icon={<IconUsers size={16} />}
        actionHref="/network"
        actionLabel="Browse all →"
      />

      <p className="mt-3 min-w-0 text-sm text-slate-600">
        {stats.total === 0 ? (
          <span>No one on Cohortly yet — be the first from IIT BHU.</span>
        ) : (
          <>
            <span className="font-semibold text-slate-800">{stats.total}</span>
            {" people from IIT BHU on Cohortly · "}
            <Link
              href="/network?status=student"
              className="font-semibold text-[var(--brand)] underline-offset-2 hover:underline"
            >
              {stats.students} {stats.students === 1 ? "student" : "students"}
            </Link>
            {" · "}
            <Link
              href="/network?status=graduate"
              className="font-semibold text-[var(--brand)] underline-offset-2 hover:underline"
            >
              {stats.graduates}{" "}
              {stats.graduates === 1 ? "graduate" : "graduates"}
            </Link>
          </>
        )}
      </p>

      <div className="mt-4 rounded-2xl border border-slate-100 bg-slate-50/60 p-3 sm:p-3.5">
        <div
          className="grid grid-cols-2 gap-1 rounded-xl bg-teal-50/80 p-1"
          role="tablist"
          aria-label="Community browse"
        >
          {(
            [
              { id: "batch" as const, label: "By batch" },
              { id: "branch" as const, label: "By branch" },
            ] as const
          ).map((option) => {
            const active = tab === option.id;
            return (
              <button
                key={option.id}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => {
                  setTab(option.id);
                  setExpanded(false);
                }}
                className={`min-h-11 rounded-lg px-2 text-sm font-semibold transition ${
                  active
                    ? "bg-white text-teal-900 shadow-sm"
                    : "text-teal-800/70 hover:text-teal-900"
                }`}
              >
                {option.label}
              </button>
            );
          })}
        </div>

        {emptyGroups ? (
          <p className="mt-3 px-1 py-4 text-center text-sm text-slate-500">
            {tab === "batch"
              ? "Batch years will show up as people add their profiles."
              : "Departments will show up as people add their branch."}
          </p>
        ) : (
          <div className="mt-3 flex flex-wrap gap-2">
            {tab === "batch"
              ? (visible as CommunityBatchGroup[]).map((group) => (
                  <BatchChip key={group.year} group={group} />
                ))
              : (visible as CommunityDeptGroup[]).map((group) => (
                  <DeptChip key={group.department} group={group} />
                ))}

            {showMoreControl && !expanded && hiddenCount > 0 ? (
              <button
                type="button"
                onClick={() => setExpanded(true)}
                className="inline-flex min-h-11 items-center rounded-2xl border border-dashed border-teal-300/80 bg-white/70 px-3.5 text-sm font-semibold text-teal-800 transition hover:-translate-y-px hover:border-teal-400 hover:bg-white hover:shadow-[var(--shadow)]"
              >
                +{hiddenCount} more
              </button>
            ) : null}

            {showMoreControl && expanded && groups.length > VISIBLE_CAP ? (
              <button
                type="button"
                onClick={() => setExpanded(false)}
                className="inline-flex min-h-11 items-center rounded-2xl border border-dashed border-slate-200 bg-white/70 px-3.5 text-sm font-semibold text-slate-600 transition hover:-translate-y-px hover:bg-white"
              >
                Show less
              </button>
            ) : null}
          </div>
        )}
      </div>
    </SectionCard>
  );
}

function BatchChip({ group }: { group: CommunityBatchGroup }) {
  const graduate = group.tint === "graduate";
  return (
    <Link
      href={`/network?batch=${group.year}`}
      className={`inline-flex min-h-11 items-center gap-2 rounded-2xl border px-3.5 py-2 transition-[transform,box-shadow,background-color] duration-150 hover:-translate-y-px hover:shadow-[var(--shadow)] ${
        group.isOwn
          ? "border-teal-400 bg-teal-50 ring-2 ring-teal-500/25"
          : graduate
            ? "border-slate-200 bg-slate-100/90 hover:bg-white"
            : "border-teal-100 bg-white hover:bg-teal-50/50"
      }`}
    >
      <span className="flex min-w-0 flex-col leading-tight">
        <span
          className={`text-base font-bold tabular-nums ${
            graduate ? "text-slate-800" : "text-teal-900"
          }`}
        >
          {group.count}
        </span>
        <span
          className={`text-[11px] font-semibold ${
            graduate ? "text-slate-500" : "text-teal-700/80"
          }`}
        >
          {group.year}
          {group.isOwn ? " · Your batch" : ""}
        </span>
      </span>
    </Link>
  );
}

function DeptChip({ group }: { group: CommunityDeptGroup }) {
  return (
    <Link
      href={`/network?dept=${encodeURIComponent(group.department)}`}
      className={`inline-flex min-h-11 max-w-full items-center gap-2.5 rounded-2xl border px-3.5 py-2 transition-[transform,box-shadow,background-color] duration-150 hover:-translate-y-px hover:shadow-[var(--shadow)] ${
        group.isOwn
          ? "border-teal-400 bg-teal-50 ring-2 ring-teal-500/25"
          : "border-teal-100 bg-white hover:bg-teal-50/50"
      }`}
    >
      <MiniAvatarStack avatars={group.avatars} />
      <span className="flex min-w-0 flex-col leading-tight">
        <span className="text-base font-bold tabular-nums text-teal-900">
          {group.count}
        </span>
        <span className="max-w-[9.5rem] truncate text-[11px] font-semibold text-teal-700/80 sm:max-w-[12rem]">
          {group.department}
          {group.isOwn ? " · Yours" : ""}
        </span>
      </span>
    </Link>
  );
}

function MiniAvatarStack({
  avatars,
}: {
  avatars: CommunityDeptGroup["avatars"];
}) {
  if (avatars.length === 0) {
    return (
      <span
        aria-hidden
        className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-teal-100 text-[10px] font-bold text-teal-800"
      >
        ?
      </span>
    );
  }

  return (
    <span className="inline-flex shrink-0 items-center pl-1">
      {avatars.map((person, index) => {
        const tone = accentFromId(person.id);
        return (
          <span
            key={person.id}
            className="relative inline-flex h-7 w-7 shrink-0 items-center justify-center overflow-hidden rounded-full text-[9px] font-bold ring-2 ring-white"
            style={{
              marginLeft: index === 0 ? 0 : -8,
              zIndex: avatars.length - index,
              background: person.avatar_url ? undefined : tone.soft,
              color: tone.solid,
            }}
          >
            {person.avatar_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={person.avatar_url}
                alt=""
                className="h-full w-full object-cover"
              />
            ) : (
              getInitials(person.full_name)
            )}
          </span>
        );
      })}
    </span>
  );
}
