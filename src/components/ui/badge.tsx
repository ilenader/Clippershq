import { cn } from "@/lib/utils";
import type { StatusVariant } from "@/types";

const variantStyles: Record<StatusVariant, string> = {
  pending: "bg-yellow-500/10 text-yellow-400 border-yellow-500/20",
  approved: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20",
  rejected: "bg-red-500/10 text-red-400 border-red-500/20",
  flagged: "bg-orange-500/10 text-orange-400 border-orange-500/20",
  archived: "bg-zinc-500/10 text-zinc-400 border-zinc-500/20",
  active: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20",
  paused: "bg-yellow-500/10 text-yellow-400 border-yellow-500/20",
  draft: "bg-zinc-500/10 text-zinc-400 border-zinc-500/20",
  completed: "bg-blue-500/10 text-blue-400 border-blue-500/20",
  requested: "bg-yellow-500/10 text-yellow-400 border-yellow-500/20",
  under_review: "bg-blue-500/10 text-blue-400 border-blue-500/20",
  paid: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20",
  verified: "bg-cyan-500/10 text-cyan-400 border-cyan-500/20",
};

interface BadgeProps {
  variant: StatusVariant;
  children: React.ReactNode;
  className?: string;
}

export function Badge({ variant, children, className }: BadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center whitespace-nowrap flex-shrink-0 rounded-full border px-3 py-1 text-xs font-semibold capitalize",
        variantStyles[variant] || variantStyles.pending,
        className
      )}
    >
      {children}
    </span>
  );
}
