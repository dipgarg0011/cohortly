"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  roleFramedHeadline,
  storageKeyForContextCollapse,
  type ContextNextAction,
  type ThreadContext,
} from "@/lib/conversation-context";
import {
  IconBriefcase,
  IconMentor,
  IconReferral,
} from "@/components/ui/icons";

export type { ThreadContext, ContextNextAction };

type Props = {
  context: ThreadContext;
  /** Compact strip above the compose input (empty-thread helper). */
  compact?: boolean;
  busyAction?: boolean;
  onNextAction?: (action: ContextNextAction) => void;
};

function TypeIcon({ type }: { type: ThreadContext["contextType"] }) {
  const props = { size: 14, className: "shrink-0 opacity-80" };
  if (type === "mentorship") return <IconMentor {...props} />;
  if (type === "opportunity") return <IconBriefcase {...props} />;
  return <IconReferral {...props} />;
}

function typeEyebrow(type: ThreadContext["contextType"]): string {
  if (type === "mentorship") return "Mentorship";
  if (type === "opportunity") return "Opportunity";
  return "Referral";
}

function accentClasses(type: ThreadContext["contextType"]): {
  wrap: string;
  eyebrow: string;
  button: string;
} {
  if (type === "mentorship") {
    return {
      wrap: "border-amber-200/70 bg-amber-50/60",
      eyebrow: "text-amber-800/80",
      button: "text-amber-950",
    };
  }
  if (type === "opportunity") {
    return {
      wrap: "border-sky-200/70 bg-sky-50/60",
      eyebrow: "text-sky-800/80",
      button: "text-sky-950",
    };
  }
  return {
    wrap: "border-teal-200/70 bg-teal-50/60",
    eyebrow: "text-teal-800/80",
    button: "text-teal-950",
  };
}

function CollapsibleBlock({
  labelShow,
  labelHide,
  text,
  buttonClass,
  storageKey,
}: {
  labelShow: string;
  labelHide: string;
  text: string;
  buttonClass: string;
  storageKey: string;
}) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(storageKey);
      if (raw === "1") setOpen(true);
    } catch {
      /* ignore */
    }
  }, [storageKey]);

  function toggle() {
    setOpen((v) => {
      const next = !v;
      try {
        localStorage.setItem(storageKey, next ? "1" : "0");
      } catch {
        /* ignore */
      }
      return next;
    });
  }

  return (
    <div className="mt-2">
      <button
        type="button"
        onClick={toggle}
        className={`text-xs font-semibold hover:underline ${buttonClass}`}
        aria-expanded={open}
      >
        {open ? labelHide : labelShow}
      </button>
      {open ? (
        <p className="mt-1 break-safe whitespace-pre-wrap rounded-lg bg-white/80 px-2.5 py-2 text-xs leading-relaxed text-slate-700">
          {text}
        </p>
      ) : (
        <p className="mt-1 line-clamp-2 break-safe text-xs text-slate-600">
          {text}
        </p>
      )}
    </div>
  );
}

export function ConversationContextHeader({
  context,
  compact = false,
  busyAction = false,
  onNextAction,
}: Props) {
  const accent = accentClasses(context.contextType);
  const collapseKey = storageKeyForContextCollapse(context.conversationId);
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(collapseKey);
      if (raw === "1") setCollapsed(true);
    } catch {
      /* ignore */
    }
  }, [collapseKey]);

  function toggleCollapsed() {
    setCollapsed((v) => {
      const next = !v;
      try {
        localStorage.setItem(collapseKey, next ? "1" : "0");
      } catch {
        /* ignore */
      }
      return next;
    });
  }

  const headline = roleFramedHeadline(context);
  const company = context.company?.trim() || null;
  const role = context.role?.trim() || context.title?.trim() || null;

  if (compact) {
    return (
      <div
        className={`rounded-xl border px-3 py-2 text-xs ${accent.wrap} text-slate-800`}
      >
        <p className="font-semibold">{headline}</p>
        {(context.description || context.pitch)?.trim() ? (
          <p className="mt-0.5 line-clamp-2 text-slate-600">
            {(context.description || context.pitch)?.trim()}
          </p>
        ) : null}
      </div>
    );
  }

  return (
    <div className={`shrink-0 border-b px-3 py-3 sm:px-4 ${accent.wrap}`}>
      <div className="flex min-w-0 flex-wrap items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <TypeIcon type={context.contextType} />
            <p
              className={`text-[11px] font-bold uppercase tracking-wide ${accent.eyebrow}`}
            >
              {typeEyebrow(context.contextType)}
            </p>
          </div>
          <p className="mt-0.5 break-safe text-sm font-bold text-slate-900">
            {headline}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {context.linkHref ? (
            <Link
              href={context.linkHref}
              className="text-xs font-bold text-teal-800 hover:underline"
            >
              {context.linkLabel ?? "View request →"}
            </Link>
          ) : null}
          <button
            type="button"
            onClick={toggleCollapsed}
            className={`text-xs font-semibold hover:underline ${accent.button}`}
            aria-expanded={!collapsed}
          >
            {collapsed ? "Expand" : "Collapse"}
          </button>
        </div>
      </div>

      {!context.sourceActive ? (
        <p className="mt-2 rounded-lg bg-white/70 px-2.5 py-1.5 text-xs font-medium text-slate-600">
          This request is no longer active
        </p>
      ) : null}

      {!collapsed ? (
        <>
          {(context.contextType === "referral" ||
            context.contextType === "referral_question") && (
            <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-xs text-slate-700">
              {company ? (
                <>
                  <dt className="font-semibold text-slate-500">Company</dt>
                  <dd className="break-safe">{company}</dd>
                </>
              ) : null}
              {role ? (
                <>
                  <dt className="font-semibold text-slate-500">Role</dt>
                  <dd className="break-safe">{role}</dd>
                </>
              ) : null}
              {context.stageLabel ? (
                <>
                  <dt className="font-semibold text-slate-500">Stage</dt>
                  <dd>{context.stageLabel}</dd>
                </>
              ) : null}
            </dl>
          )}

          {context.contextType === "mentorship" && (
            <>
              {context.title ? (
                <p className="mt-2 break-safe text-xs font-semibold text-slate-800">
                  {context.title}
                </p>
              ) : null}
              {context.description?.trim() ? (
                <CollapsibleBlock
                  labelShow="Show original question"
                  labelHide="Hide original question"
                  text={context.description.trim()}
                  buttonClass={accent.button}
                  storageKey={`${collapseKey}:ask`}
                />
              ) : null}
              {context.answerContent?.trim() ? (
                <CollapsibleBlock
                  labelShow="Show mentor answer"
                  labelHide="Hide mentor answer"
                  text={context.answerContent.trim()}
                  buttonClass={accent.button}
                  storageKey={`${collapseKey}:answer`}
                />
              ) : null}
            </>
          )}

          {context.contextType === "opportunity" && (
            <>
              <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-xs text-slate-700">
                {role ? (
                  <>
                    <dt className="font-semibold text-slate-500">Role</dt>
                    <dd className="break-safe">{role}</dd>
                  </>
                ) : null}
                {company ? (
                  <>
                    <dt className="font-semibold text-slate-500">Company</dt>
                    <dd className="break-safe">{company}</dd>
                  </>
                ) : null}
                {context.stageLabel ? (
                  <>
                    <dt className="font-semibold text-slate-500">Stage</dt>
                    <dd>{context.stageLabel}</dd>
                  </>
                ) : null}
              </dl>
              {context.pitch?.trim() ? (
                <CollapsibleBlock
                  labelShow="Show applicant pitch"
                  labelHide="Hide applicant pitch"
                  text={context.pitch.trim()}
                  buttonClass={accent.button}
                  storageKey={`${collapseKey}:pitch`}
                />
              ) : null}
            </>
          )}

          {context.nextAction && context.sourceActive ? (
            <div className="mt-3">
              <button
                type="button"
                disabled={busyAction}
                onClick={() => onNextAction?.(context.nextAction!)}
                className="rounded-lg bg-[var(--brand)] px-3 py-1.5 text-xs font-bold text-white transition hover:opacity-90 disabled:opacity-60"
              >
                {busyAction ? "…" : context.nextAction.label}
              </button>
            </div>
          ) : null}
        </>
      ) : (
        <p className="mt-1 truncate text-xs text-slate-600">
          {[company, role, context.stageLabel].filter(Boolean).join(" · ")}
        </p>
      )}
    </div>
  );
}

/** Small type icon + label for inbox / dashboard rows. */
export function ConversationTypeLabel({
  label,
  contextType,
}: {
  label: string;
  contextType?: ThreadContext["contextType"] | "connection" | null;
}) {
  if (!label) return null;
  const type =
    contextType === "mentorship" ||
    contextType === "opportunity" ||
    contextType === "referral" ||
    contextType === "referral_question"
      ? contextType
      : label.startsWith("Mentorship")
        ? "mentorship"
        : label.startsWith("Opportunity")
          ? "opportunity"
          : "referral";

  return (
    <p className="flex min-w-0 items-center gap-1 truncate text-[11px] font-semibold text-teal-800">
      <TypeIcon type={type} />
      <span className="truncate">{label}</span>
    </p>
  );
}
