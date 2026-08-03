import type { ProfileRole } from "@/lib/network";

type Props = {
  role: ProfileRole;
  className?: string;
};

/** Graduate = filled; Student = outlined. */
export function StatusBadge({ role, className = "" }: Props) {
  const isGraduate = role === "Graduate";
  return (
    <span
      className={`inline-flex shrink-0 items-center rounded-full px-2 py-0.5 text-[11px] font-bold leading-4 ${
        isGraduate
          ? "bg-[var(--accent-profile)] text-white"
          : "border border-teal-700/30 bg-transparent text-teal-800"
      } ${className}`}
    >
      {role}
    </span>
  );
}
