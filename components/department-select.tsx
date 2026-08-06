"use client";

import { useEffect, useId, useState } from "react";
import {
  DEPARTMENT_NOT_LISTED_HREF,
  FALLBACK_DEPARTMENTS,
  fetchDepartments,
  formatDepartmentLabel,
  type Department,
} from "@/lib/departments";
import { createClient } from "@/lib/supabase/client";

const SELECT_CLASS =
  "w-full min-w-0 rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm text-slate-900 outline-none transition focus:border-teal-500 focus:ring-2 focus:ring-teal-500/20";

type Props = {
  id?: string;
  name?: string;
  value: string;
  onChange: (shortCode: string) => void;
  /** When true, load from public.departments (authenticated). Default: fallback list. */
  fetchFromDb?: boolean;
  required?: boolean;
  /** Allow empty selection (profile edit). Default false when required. */
  allowEmpty?: boolean;
  disabled?: boolean;
  className?: string;
  showNotListedHint?: boolean;
};

export function DepartmentSelect({
  id,
  name,
  value,
  onChange,
  fetchFromDb = false,
  required = false,
  allowEmpty,
  disabled = false,
  className = "",
  showNotListedHint = true,
}: Props) {
  const autoId = useId();
  const selectId = id ?? autoId;
  const [departments, setDepartments] =
    useState<readonly Department[]>(FALLBACK_DEPARTMENTS);

  useEffect(() => {
    if (!fetchFromDb) {
      setDepartments(FALLBACK_DEPARTMENTS);
      return;
    }

    let cancelled = false;
    const supabase = createClient();
    void fetchDepartments(supabase).then((list) => {
      if (!cancelled) setDepartments(list);
    });

    return () => {
      cancelled = true;
    };
  }, [fetchFromDb]);

  const emptyAllowed = allowEmpty ?? !required;
  // If value is a legacy free-text not in the list, treat as unset so user re-picks.
  const selectValue =
    value && departments.some((d) => d.short_code === value) ? value : "";

  return (
    <div className={className}>
      <select
        id={selectId}
        name={name}
        value={selectValue}
        onChange={(e) => onChange(e.target.value)}
        required={required}
        disabled={disabled}
        className={SELECT_CLASS}
      >
        <option value="" disabled={!emptyAllowed}>
          {emptyAllowed ? "Select department (optional)" : "Select department"}
        </option>
        {departments.map((dept) => (
          <option key={dept.short_code} value={dept.short_code}>
            {formatDepartmentLabel(dept)}
          </option>
        ))}
      </select>
      {showNotListedHint ? (
        <p className="mt-1.5 text-xs text-slate-500">
          Department not listed?{" "}
          <a
            href={DEPARTMENT_NOT_LISTED_HREF}
            className="font-medium text-[var(--brand)] hover:underline"
          >
            Email us
          </a>
        </p>
      ) : null}
    </div>
  );
}
