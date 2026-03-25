"use client";

import { useState } from "react";

interface DonutSegment {
  label: string;
  value: number;
  color: string;
}

interface DonutChartProps {
  segments: DonutSegment[];
  title?: string;
  size?: number;
}

export function DonutChart({ segments, title, size = 180 }: DonutChartProps) {
  const [hovered, setHovered] = useState<number | null>(null);
  const total = segments.reduce((s, seg) => s + seg.value, 0);
  if (total === 0) return null;

  const r = 40;
  const cx = 50;
  const cy = 50;
  const strokeWidth = 14;
  const circumference = 2 * Math.PI * r;

  let cumulativePercent = 0;

  return (
    <div>
      {title && <h3 className="text-[15px] font-semibold text-[var(--text-primary)] mb-4">{title}</h3>}
      <div className="flex items-center gap-6">
        <div style={{ width: size, height: size }} className="relative flex-shrink-0">
          <svg viewBox="0 0 100 100" className="w-full h-full -rotate-90">
            {segments.map((seg, i) => {
              const percent = seg.value / total;
              const dashLength = percent * circumference;
              const dashOffset = -cumulativePercent * circumference;
              cumulativePercent += percent;
              return (
                <circle
                  key={i}
                  cx={cx}
                  cy={cy}
                  r={r}
                  fill="none"
                  stroke={seg.color}
                  strokeWidth={strokeWidth}
                  strokeDasharray={`${dashLength} ${circumference - dashLength}`}
                  strokeDashoffset={dashOffset}
                  strokeLinecap="round"
                  opacity={hovered === null || hovered === i ? 1 : 0.3}
                  className="transition-opacity duration-150"
                  onMouseEnter={() => setHovered(i)}
                  onMouseLeave={() => setHovered(null)}
                  style={{ cursor: "pointer" }}
                />
              );
            })}
          </svg>
          {/* Center text */}
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            {hovered !== null ? (
              <>
                <span className="text-lg font-bold text-[var(--text-primary)] tabular-nums">
                  {Math.round((segments[hovered].value / total) * 100)}%
                </span>
                <span className="text-xs text-[var(--text-muted)]">{segments[hovered].label}</span>
              </>
            ) : (
              <>
                <span className="text-lg font-bold text-[var(--text-primary)] tabular-nums">{total}</span>
                <span className="text-xs text-[var(--text-muted)]">Total</span>
              </>
            )}
          </div>
        </div>
        {/* Legend */}
        <div className="space-y-2 flex-1">
          {segments.map((seg, i) => (
            <div
              key={i}
              className={`flex items-center justify-between text-sm cursor-pointer transition-opacity duration-150 ${hovered !== null && hovered !== i ? "opacity-40" : ""}`}
              onMouseEnter={() => setHovered(i)}
              onMouseLeave={() => setHovered(null)}
            >
              <div className="flex items-center gap-2">
                <div className="h-2.5 w-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: seg.color }} />
                <span className="text-[var(--text-secondary)]">{seg.label}</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="font-medium text-[var(--text-primary)] tabular-nums">{seg.value}</span>
                <span className="text-xs text-[var(--text-muted)] tabular-nums w-10 text-right">
                  {Math.round((seg.value / total) * 100)}%
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
