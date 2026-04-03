"use client";

const TIMEFRAME_OPTIONS = [
  { value: 15, label: "15 days" },
  { value: 30, label: "30 days" },
  { value: 60, label: "60 days" },
  { value: 90, label: "90 days" },
  { value: 365, label: "1 year" },
];

interface TimeframeSelectProps {
  value: number;
  onChange: (days: number) => void;
}

export function TimeframeSelect({ value, onChange }: TimeframeSelectProps) {
  return (
    <div className="flex gap-1 rounded-xl border border-[var(--border-color)] p-0.5">
      {TIMEFRAME_OPTIONS.map((opt) => (
        <button
          key={opt.value}
          type="button"
          onClick={() => onChange(opt.value)}
          className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-all cursor-pointer ${
            value === opt.value
              ? "bg-accent text-white"
              : "text-[var(--text-secondary)] hover:bg-[var(--bg-input)]"
          }`}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}

/** Filter items by createdAt within the last N days */
export function filterByTimeframe<T extends { createdAt?: string | Date | null }>(
  items: T[],
  days: number,
): T[] {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - days);
  cutoff.setHours(0, 0, 0, 0);
  return items.filter((item) => {
    if (!item.createdAt) return false;
    return new Date(item.createdAt) >= cutoff;
  });
}
