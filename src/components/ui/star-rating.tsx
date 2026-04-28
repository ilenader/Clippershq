"use client";

import { Star } from "lucide-react";

// Phase 7a — shared star rating component. Two modes:
//   - Read-only (default): renders filled/empty stars matching `value`. Sizes
//     md/lg also support half-star display via clip-path overlay; sm rounds
//     to whole stars to stay legible at the small badge size used on cards.
//   - Interactive (interactive=true): renders 5 buttons in a radiogroup;
//     clicking fires onChange(1..5). No half values in interactive input —
//     ratings are always integer.
//
// Tokens: filled stars use text-accent + fill-current; empty stars use
// var(--text-muted). No new colors introduced.

interface StarRatingProps {
  /** 0..max, may be fractional in read-only mode (e.g. 4.7). */
  value: number;
  max?: number;
  size?: "sm" | "md" | "lg";
  interactive?: boolean;
  /** Required when interactive=true. Fires with a 1..max integer. */
  onChange?: (n: number) => void;
  /** Accessible label for the whole control. Defaults to a sensible value. */
  ariaLabel?: string;
  className?: string;
}

const SIZE_CLASS: Record<"sm" | "md" | "lg", string> = {
  sm: "h-3 w-3",
  md: "h-4 w-4",
  lg: "h-6 w-6",
};

export function StarRating({
  value,
  max = 5,
  size = "sm",
  interactive = false,
  onChange,
  ariaLabel,
  className,
}: StarRatingProps) {
  const stars = Array.from({ length: max }, (_, i) => i + 1);
  const sizeClass = SIZE_CLASS[size];

  if (interactive) {
    const rounded = Math.max(0, Math.min(max, Math.round(value)));
    return (
      <div
        role="radiogroup"
        aria-label={ariaLabel ?? "Rate"}
        className={`inline-flex items-center gap-1 ${className ?? ""}`}
      >
        {stars.map((n) => {
          const filled = n <= rounded;
          return (
            <button
              key={n}
              type="button"
              role="radio"
              aria-checked={n === rounded}
              aria-label={`${n} ${n === 1 ? "star" : "stars"}`}
              onClick={() => onChange?.(n)}
              className={
                "rounded p-1 transition-transform hover:scale-110 active:scale-95 " +
                (filled ? "text-accent" : "text-[var(--text-muted)]")
              }
            >
              <Star className={`${sizeClass} ${filled ? "fill-current" : ""}`} />
            </button>
          );
        })}
      </div>
    );
  }

  // Read-only display.
  const supportHalf = size !== "sm";
  return (
    <span
      className={`inline-flex items-center gap-0.5 ${className ?? ""}`}
      aria-label={ariaLabel ?? `${value.toFixed(1)} out of ${max}`}
    >
      {stars.map((n) => {
        const fillRatio = Math.max(0, Math.min(1, value - (n - 1)));
        const isHalf = supportHalf && fillRatio >= 0.25 && fillRatio < 0.75;
        const isFull = supportHalf ? fillRatio >= 0.75 : fillRatio >= 0.5;
        if (isHalf) {
          return (
            <span key={n} className="relative inline-flex">
              <Star className={`${sizeClass} text-[var(--text-muted)]`} />
              <Star
                className={`${sizeClass} absolute inset-0 fill-current text-accent`}
                style={{ clipPath: "inset(0 50% 0 0)" }}
              />
            </span>
          );
        }
        return (
          <Star
            key={n}
            className={
              `${sizeClass} ` +
              (isFull ? "fill-current text-accent" : "text-[var(--text-muted)]")
            }
          />
        );
      })}
    </span>
  );
}
