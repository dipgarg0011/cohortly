type Props = {
  className?: string;
};

export function SectionCardSkeleton({ className = "" }: Props) {
  return (
    <div className={`section-card space-y-3 p-4 sm:p-5 ${className}`}>
      <div className="flex items-center gap-3">
        <div className="skeleton h-9 w-9 rounded-xl" />
        <div className="skeleton h-5 w-40" />
      </div>
      <div className="skeleton h-12 w-full" />
      <div className="skeleton h-12 w-full" />
      <div className="skeleton h-12 w-4/5" />
    </div>
  );
}

export function PersonRowSkeleton({ className = "" }: Props) {
  return (
    <div className={`person-row flex items-center gap-3 ${className}`}>
      <div className="skeleton h-12 w-12 shrink-0 rounded-full" />
      <div className="min-w-0 flex-1 space-y-2">
        <div className="skeleton h-4 w-36" />
        <div className="skeleton h-3 w-48" />
      </div>
      <div className="skeleton h-8 w-16 rounded-lg" />
    </div>
  );
}

export function FeedRowSkeleton({ className = "" }: Props) {
  return (
    <div className={`flex items-center gap-2.5 px-1 py-2 ${className}`}>
      <div className="skeleton h-9 w-9 shrink-0 rounded-full" />
      <div className="min-w-0 flex-1 space-y-1.5">
        <div className="skeleton h-3.5 w-28" />
        <div className="skeleton h-3 w-full max-w-[14rem]" />
      </div>
    </div>
  );
}
