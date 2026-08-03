import { getInitials } from "@/lib/network";
import { accentFromId } from "@/lib/accent-from-id";

type Props = {
  id: string;
  name: string | null;
  url: string | null;
  size?: "sm" | "md" | "lg";
  className?: string;
};

const SIZE = {
  sm: "h-10 w-10 text-[11px]",
  md: "h-12 w-12 text-sm",
  lg: "h-14 w-14 text-base",
};

export function PersonAvatar({
  id,
  name,
  url,
  size = "md",
  className = "",
}: Props) {
  const tone = accentFromId(id);
  const dim = SIZE[size];

  if (url) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={url}
        alt=""
        className={`${dim} shrink-0 rounded-full object-cover ${className}`}
        style={{ boxShadow: `0 0 0 2px ${tone.ring}` }}
      />
    );
  }

  return (
    <div
      aria-hidden
      className={`flex ${dim} shrink-0 items-center justify-center rounded-full font-bold ${className}`}
      style={{
        background: tone.soft,
        color: tone.solid,
        boxShadow: `0 0 0 2px ${tone.ring}`,
      }}
    >
      {getInitials(name)}
    </div>
  );
}
