// Phase 10 — shared skeleton card grid for marketplace list pages.
// Replaces the plain "Loading..." text with a card-shaped pulse that matches
// the real card layout (title bar + 3 text bars + 3-up footer stats).
// Cheap to render, animates via Tailwind animate-pulse.
import { cn } from "@/lib/utils";

interface SkeletonCardProps {
  count?: number;
  className?: string;
}

function Bar({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        "h-3 rounded bg-[var(--bg-input)]",
        className,
      )}
    />
  );
}

function SingleSkeletonCard() {
  return (
    <div className="rounded-2xl border border-[var(--border-color)] bg-[var(--bg-card)] p-5 animate-pulse">
      <div className="mb-4 flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-full bg-[var(--bg-input)]" />
          <div className="space-y-2">
            <Bar className="w-28" />
            <Bar className="h-2 w-16" />
          </div>
        </div>
        <Bar className="h-5 w-16 rounded-full" />
      </div>
      <Bar className="mb-2 w-3/4" />
      <Bar className="mb-4 w-1/2" />
      <div className="grid grid-cols-3 gap-2 rounded-xl border border-[var(--border-color)] bg-[var(--bg-page)] p-2">
        <div className="space-y-1.5 py-1">
          <Bar className="mx-auto h-4 w-8" />
          <Bar className="mx-auto h-2 w-12" />
        </div>
        <div className="space-y-1.5 py-1">
          <Bar className="mx-auto h-4 w-8" />
          <Bar className="mx-auto h-2 w-12" />
        </div>
        <div className="space-y-1.5 py-1">
          <Bar className="mx-auto h-4 w-8" />
          <Bar className="mx-auto h-2 w-12" />
        </div>
      </div>
    </div>
  );
}

export function SkeletonCardGrid({ count = 6, className }: SkeletonCardProps) {
  return (
    <div
      className={cn(
        "grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3",
        className,
      )}
      aria-label="Loading"
      aria-busy="true"
      role="status"
    >
      {Array.from({ length: count }).map((_, i) => (
        <SingleSkeletonCard key={i} />
      ))}
    </div>
  );
}
