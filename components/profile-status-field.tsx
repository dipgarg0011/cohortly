"use client";

import type { ProfileStatus } from "@/lib/network";

type Props = {
  value: ProfileStatus;
  onChange: (next: ProfileStatus) => void;
  idPrefix?: string;
};

/** Required student / graduate control used on signup and profile edit. */
export function ProfileStatusField({
  value,
  onChange,
  idPrefix = "status",
}: Props) {
  return (
    <fieldset className="min-w-0">
      <legend className="mb-1.5 block text-sm font-medium text-slate-700">
        I am currently
      </legend>
      <div
        className="grid grid-cols-2 gap-1 rounded-xl bg-teal-50 p-1"
        role="radiogroup"
        aria-label="I am currently"
      >
        {(
          [
            { id: "student", label: "a student" },
            { id: "graduate", label: "a graduate" },
          ] as const
        ).map((option) => {
          const active = value === option.id;
          const inputId = `${idPrefix}-${option.id}`;
          return (
            <label
              key={option.id}
              htmlFor={inputId}
              className={`cursor-pointer rounded-lg px-2 py-2 text-center text-sm font-semibold transition ${
                active
                  ? "bg-white text-teal-900 shadow-sm"
                  : "text-teal-700/70 hover:text-teal-900"
              }`}
            >
              <input
                id={inputId}
                type="radio"
                name={idPrefix}
                value={option.id}
                checked={active}
                onChange={() => onChange(option.id)}
                className="sr-only"
                required
              />
              {option.label}
            </label>
          );
        })}
      </div>
      <p className="mt-1.5 text-xs text-slate-500">
        Batch year is your graduation / passout year.
      </p>
    </fieldset>
  );
}
