"use client";

import { useEffect, useId, useState } from "react";
import {
  DEPARTMENT_CUSTOM_MAX_LENGTH,
  DEPARTMENT_NOT_LISTED_HREF,
  DEPARTMENT_NOT_LISTED_VALUE,
  FALLBACK_DEPARTMENTS,
  fetchDepartments,
  formatDepartmentLabel,
  type Department,
} from "@/lib/departments";
import { createClient } from "@/lib/supabase/client";

const SELECT_CLASS =
  "w-full min-w-0 rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm text-slate-900 outline-none transition focus:border-teal-500 focus:ring-2 focus:ring-teal-500/20";

const INPUT_CLASS =
  "mt-2 w-full min-w-0 rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-teal-500 focus:ring-2 focus:ring-teal-500/20";

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
  /** Secondary mailto help under the custom path. Default true. */
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
  const customId = `${selectId}-custom`;
  const [departments, setDepartments] =
    useState<readonly Department[]>(FALLBACK_DEPARTMENTS);
  const [notListedSelected, setNotListedSelected] = useState(false);

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
  const isKnown =
    Boolean(value) && departments.some((d) => d.short_code === value);
  const inNotListedMode =
    notListedSelected || (Boolean(value.trim()) && !isKnown);

  // Sync: existing custom profile value opens the not-listed path.
  useEffect(() => {
    if (value.trim() && !departments.some((d) => d.short_code === value)) {
      setNotListedSelected(true);
    }
  }, [value, departments]);

  const selectValue = isKnown
    ? value
    : inNotListedMode
      ? DEPARTMENT_NOT_LISTED_VALUE
      : "";

  function handleSelectChange(next: string) {
    if (next === DEPARTMENT_NOT_LISTED_VALUE) {
      setNotListedSelected(true);
      // Clear a prior canonical pick; keep existing custom text if any.
      if (isKnown || !value.trim()) {
        onChange("");
      }
      return;
    }
    setNotListedSelected(false);
    onChange(next);
  }

  return (
    <div className={className}>
      <select
        id={selectId}
        name={inNotListedMode ? undefined : name}
        value={selectValue}
        onChange={(e) => handleSelectChange(e.target.value)}
        required={required && !inNotListedMode}
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
        <option value={DEPARTMENT_NOT_LISTED_VALUE}>
          My department isn&apos;t listed
        </option>
      </select>

      {inNotListedMode ? (
        <div>
          <label htmlFor={customId} className="sr-only">
            Your department name or code
          </label>
          <input
            id={customId}
            name={name}
            type="text"
            value={isKnown ? "" : value}
            onChange={(e) => onChange(e.target.value)}
            required={required}
            disabled={disabled}
            maxLength={DEPARTMENT_CUSTOM_MAX_LENGTH}
            placeholder="Department name or short code"
            autoComplete="organization-title"
            className={INPUT_CLASS}
          />
          {showNotListedHint ? (
            <p className="mt-1.5 text-xs text-slate-500">
              Prefer an official short code if you know it. Still stuck?{" "}
              <a
                href={DEPARTMENT_NOT_LISTED_HREF}
                className="font-medium text-[var(--brand)] hover:underline"
              >
                Email us
              </a>
            </p>
          ) : null}
        </div>
      ) : showNotListedHint ? (
        <p className="mt-1.5 text-xs text-slate-500">
          Don&apos;t see yours? Choose{" "}
          <span className="font-medium text-slate-600">
            My department isn&apos;t listed
          </span>{" "}
          above.
        </p>
      ) : null}
    </div>
  );
}
