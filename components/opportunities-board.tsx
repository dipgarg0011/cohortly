"use client";

import { useMemo, useState, type FormEvent } from "react";
import { createClient } from "@/lib/supabase/client";
import { deadlineLabel, isDeadlineUrgent } from "@/lib/referrals";
import { EmptyState } from "@/components/ui/empty-state";
import { SurfaceCard } from "@/components/ui/surface-card";
import { AppModal } from "@/components/ui/app-modal";
import { IconOpportunityEmpty } from "@/components/ui/icons";
import {
  OPPORTUNITY_TYPES,
  TYPE_FILTERS,
  normalizeOpportunity,
  type Opportunity,
  type OpportunityFilter,
  type OpportunityType,
} from "@/lib/opportunities";

type Props = {
  initialOpportunities: Opportunity[];
};

export function OpportunitiesBoard({ initialOpportunities }: Props) {
  const [items, setItems] = useState(initialOpportunities);
  const [filter, setFilter] = useState<OpportunityFilter>("all");
  const [showForm, setShowForm] = useState(false);

  const filtered = useMemo(() => {
    if (filter === "all") return items;
    return items.filter((item) => item.type === filter);
  }, [items, filter]);

  return (
    <div className="space-y-6 min-w-0 overflow-x-clip">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div
          className="flex w-full min-w-0 flex-wrap gap-1 rounded-xl bg-teal-50 p-1"
          role="tablist"
          aria-label="Opportunity type"
        >
          {TYPE_FILTERS.map((option) => {
            const active = filter === option.id;
            return (
              <button
                key={option.id}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => setFilter(option.id)}
                className={`min-w-0 flex-1 truncate rounded-lg px-2 py-2 text-[11px] font-semibold transition sm:flex-none sm:px-3 sm:text-sm ${
                  active
                    ? "bg-white text-teal-900 shadow-sm"
                    : "text-teal-700/70 hover:text-teal-900"
                }`}
              >
                <span className="truncate">{option.label}</span>
              </button>
            );
          })}
        </div>

        <button
          type="button"
          onClick={() => setShowForm((v) => !v)}
          className="btn-primary w-full shrink-0 sm:w-auto"
        >
          {showForm ? "Cancel" : "Post an Opportunity"}
        </button>
      </div>

      {showForm && (
        <AppModal
          open={showForm}
          onClose={() => setShowForm(false)}
          title="Post an opportunity"
          description="Share an internship, job, research role, or early-stage opening."
          maxWidthClass="sm:max-w-lg"
        >
          <OpportunityForm
            onCreated={(item) => {
              setItems((prev) => [item, ...prev]);
              setShowForm(false);
              setFilter("all");
            }}
            onCancel={() => setShowForm(false)}
          />
        </AppModal>
      )}

      {filtered.length === 0 ? (
        <EmptyState
          icon={<IconOpportunityEmpty />}
          title="The board is wide open"
          description="Share an internship, job, research role, or early-stage startup opening with your college community."
          actionLabel="Post an Opportunity"
          onAction={() => setShowForm(true)}
          accentSoft="var(--accent-opportunities-soft)"
        />
      ) : (
        <ul className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          {filtered.map((item) => (
            <li key={item.id} className="min-w-0">
              <OpportunityCard opportunity={item} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function OpportunityForm({
  onCreated,
  onCancel,
}: {
  onCreated: (item: Opportunity) => void;
  onCancel: () => void;
}) {
  const supabase = useMemo(() => createClient(), []);
  const [type, setType] = useState<OpportunityType>("Internship");
  const [title, setTitle] = useState("");
  const [company, setCompany] = useState("");
  const [description, setDescription] = useState("");
  const [applyLink, setApplyLink] = useState("");
  const [location, setLocation] = useState("");
  const [deadline, setDeadline] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setLoading(true);
    setError(null);

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      setError("You need to be logged in.");
      setLoading(false);
      return;
    }

    const { data, error: insertError } = await supabase
      .from("opportunities")
      .insert({
        posted_by: user.id,
        type,
        title: title.trim(),
        company: company.trim() || null,
        description: description.trim() || null,
        apply_link: applyLink.trim() || null,
        location: location.trim() || null,
        deadline: deadline || null,
      })
      .select(
        `
        id, posted_by, type, title, company, description, apply_link, location, deadline, created_at,
        poster:profiles!posted_by ( id, full_name, batch_year )
      `,
      )
      .single();

    if (insertError) {
      setError(insertError.message);
      setLoading(false);
      return;
    }

    onCreated(normalizeOpportunity(data as Record<string, unknown>));
    setLoading(false);
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block">
          <span className="mb-1.5 block text-sm font-medium text-slate-700">
            Type
          </span>
          <select
            value={type}
            onChange={(e) => setType(e.target.value as OpportunityType)}
            className="w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-500/20"
          >
            {OPPORTUNITY_TYPES.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="mb-1.5 block text-sm font-medium text-slate-700">
            Company
          </span>
          <input
            value={company}
            onChange={(e) => setCompany(e.target.value)}
            placeholder="Company or lab"
            className="w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-500/20"
          />
        </label>
        <label className="block sm:col-span-2">
          <span className="mb-1.5 block text-sm font-medium text-slate-700">
            Title
          </span>
          <input
            required
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Software Engineering Intern"
            className="w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-500/20"
          />
        </label>
        <label className="block sm:col-span-2">
          <span className="mb-1.5 block text-sm font-medium text-slate-700">
            Description
          </span>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={4}
            placeholder="What the role involves, who it's for…"
            className="w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-500/20"
          />
        </label>
        <label className="block sm:col-span-2">
          <span className="mb-1.5 block text-sm font-medium text-slate-700">
            Apply link
          </span>
          <input
            type="url"
            value={applyLink}
            onChange={(e) => setApplyLink(e.target.value)}
            placeholder="https://…"
            className="w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-500/20"
          />
        </label>
        <label className="block">
          <span className="mb-1.5 block text-sm font-medium text-slate-700">
            Location
          </span>
          <input
            value={location}
            onChange={(e) => setLocation(e.target.value)}
            placeholder="Remote, Bengaluru…"
            className="w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-500/20"
          />
        </label>
        <label className="block">
          <span className="mb-1.5 block text-sm font-medium text-slate-700">
            Deadline
          </span>
          <input
            type="date"
            value={deadline}
            onChange={(e) => setDeadline(e.target.value)}
            className="w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-500/20"
          />
        </label>
      </div>

      {error && (
        <p
          role="alert"
          className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700"
        >
          {error}
        </p>
      )}

      <div className="flex flex-wrap gap-2">
        <button
          type="submit"
          disabled={loading}
          className="rounded-xl bg-[var(--brand)] px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-[var(--brand-dark)] disabled:opacity-60"
        >
          {loading ? "Posting…" : "Post opportunity"}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="rounded-xl px-4 py-2.5 text-sm font-semibold text-slate-600 hover:bg-slate-100"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}

function OpportunityCard({ opportunity }: { opportunity: Opportunity }) {
  const deadlineText = deadlineLabel(opportunity.deadline);
  const urgent = isDeadlineUrgent(opportunity.deadline);

  return (
    <SurfaceCard as="article" interactive className="flex h-full min-w-0 flex-col p-4 sm:p-5">
      <div className="flex min-w-0 items-start justify-between gap-3">
        <div className="min-w-0">
          {opportunity.company?.trim() && (
            <p className="break-safe text-xs font-bold uppercase tracking-wide text-indigo-700/80">
              {opportunity.company.trim()}
            </p>
          )}
          <h3 className="card-title mt-1 break-safe">{opportunity.title}</h3>
        </div>
        <span className="max-w-[40%] shrink-0 truncate rounded-full bg-indigo-50 px-2.5 py-1 text-xs font-bold text-indigo-700">
          {opportunity.type}
        </span>
      </div>

      {opportunity.description?.trim() && (
        <p className="mt-3 line-clamp-3 break-safe text-sm text-slate-600">
          {opportunity.description.trim()}
        </p>
      )}

      <div className="mt-4 flex min-w-0 flex-wrap gap-2 text-xs">
        {opportunity.location?.trim() && (
          <span className="max-w-full break-safe rounded-full bg-slate-100 px-2.5 py-1 font-medium text-slate-600">
            {opportunity.location.trim()}
          </span>
        )}
        {deadlineText && (
          <span
            className={`rounded-full px-2.5 py-1 font-semibold ${
              urgent
                ? "bg-amber-50 text-amber-800"
                : "bg-slate-100 text-slate-600"
            }`}
          >
            {deadlineText}
          </span>
        )}
      </div>

      {opportunity.poster?.full_name && (
        <p
          className="mt-3 min-w-0 truncate text-xs text-slate-500"
          title={opportunity.poster.full_name}
        >
          Posted by {opportunity.poster.full_name}
          {opportunity.poster.batch_year != null
            ? ` · Batch ${opportunity.poster.batch_year}`
            : ""}
        </p>
      )}

      <div className="mt-auto pt-4">
        {opportunity.apply_link ? (
          <a
            href={opportunity.apply_link}
            target="_blank"
            rel="noopener noreferrer"
            className="btn-primary w-full sm:w-auto"
          >
            Apply
          </a>
        ) : (
          <span className="text-sm text-slate-400">No apply link provided</span>
        )}
      </div>
    </SurfaceCard>
  );
}
