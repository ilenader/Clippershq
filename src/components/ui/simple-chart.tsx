"use client";

import { useState, Fragment } from "react";

interface DataPoint {
  label: string;
  value: number;
}

interface SimpleBarChartProps {
  data: DataPoint[];
  title: string;
  color?: string;
  height?: number;
  valuePrefix?: string;
  valueSuffix?: string;
}

export function SimpleBarChart({ data, title, color = "#2596be", height = 200, valuePrefix = "", valueSuffix = "" }: SimpleBarChartProps) {
  const [hovered, setHovered] = useState<number | null>(null);
  const maxValue = Math.max(...data.map((d) => d.value), 1);

  return (
    <div>
      <div className="mb-4 flex items-baseline justify-between">
        <h3 className="text-[15px] font-semibold text-[var(--text-primary)]">{title}</h3>
        {hovered !== null && (
          <span className="text-xs font-medium text-[var(--text-secondary)] tabular-nums">
            {data[hovered].label}: {valuePrefix}{data[hovered].value.toLocaleString()}{valueSuffix}
          </span>
        )}
      </div>
      <div className="flex items-end gap-[3px]" style={{ height }}>
        {data.map((point, i) => {
          const barHeight = (point.value / maxValue) * 100;
          const isHovered = hovered === i;
          return (
            <div
              key={i}
              className="group relative flex flex-1 flex-col items-center justify-end cursor-pointer"
              onMouseEnter={() => setHovered(i)}
              onMouseLeave={() => setHovered(null)}
            >
              {/* Tooltip */}
              {isHovered && (
                <div className="absolute -top-10 rounded-lg bg-[var(--bg-elevated)] px-3 py-1.5 text-xs font-medium text-[var(--text-primary)] shadow-lg z-10 whitespace-nowrap border border-[var(--border-subtle)]">
                  <span className="text-[var(--text-muted)]">{point.label}:</span> {valuePrefix}{point.value.toLocaleString()}{valueSuffix}
                </div>
              )}
              {/* Bar */}
              <div
                className="w-full rounded-t transition-all duration-200 min-h-[2px]"
                style={{
                  height: `${Math.max(barHeight, 2)}%`,
                  backgroundColor: color,
                  opacity: isHovered ? 1 : 0.65 + (barHeight / 100) * 0.35,
                }}
              />
            </div>
          );
        })}
      </div>
      {/* Labels — show first, middle, last */}
      <div className="mt-2 flex justify-between">
        {data.length > 0 && <span className="text-[10px] text-[var(--text-muted)]">{data[0].label}</span>}
        {data.length > 2 && <span className="text-[10px] text-[var(--text-muted)]">{data[Math.floor(data.length / 2)].label}</span>}
        {data.length > 1 && <span className="text-[10px] text-[var(--text-muted)]">{data[data.length - 1].label}</span>}
      </div>
    </div>
  );
}

interface SimpleLineChartProps {
  data: DataPoint[];
  title: string;
  color?: string;
  height?: number;
  valuePrefix?: string;
  valueSuffix?: string;
}

export function SimpleLineChart({ data, title, color = "#2596be", height = 200, valuePrefix = "", valueSuffix = "" }: SimpleLineChartProps) {
  const [hovered, setHovered] = useState<number | null>(null);
  const maxValue = Math.max(...data.map((d) => d.value), 1);
  const minValue = Math.min(...data.map((d) => d.value));
  const range = maxValue - minValue || 1;

  const points = data.map((d, i) => {
    const x = (i / Math.max(data.length - 1, 1)) * 100;
    const y = 100 - ((d.value - minValue) / range) * 85 - 8;
    return { x, y, value: d.value };
  });

  const pathD = points
    .map((p, i) => `${i === 0 ? "M" : "L"} ${p.x} ${p.y}`)
    .join(" ");

  const areaD = `${pathD} L 100 100 L 0 100 Z`;

  // Y-axis labels (3 ticks: min, mid, max)
  const yTicks = [maxValue, Math.round((maxValue + minValue) / 2), minValue];

  return (
    <div>
      <div className="mb-4 flex items-baseline justify-between">
        <h3 className="text-[15px] font-semibold text-[var(--text-primary)]">{title}</h3>
        {hovered !== null && (
          <span className="text-xs font-medium text-[var(--text-secondary)] tabular-nums">
            {data[hovered].label}: {valuePrefix}{data[hovered].value.toLocaleString()}{valueSuffix}
          </span>
        )}
      </div>
      <div className="flex gap-2">
        {/* Y-axis */}
        <div className="flex flex-col justify-between py-1 text-[10px] text-[var(--text-muted)] tabular-nums" style={{ height }}>
          {yTicks.map((v, i) => (
            <span key={i}>{valuePrefix}{v.toLocaleString()}</span>
          ))}
        </div>
        {/* Chart */}
        <div className="flex-1 relative" style={{ height }}>
          <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="w-full h-full">
            <path d={areaD} fill={color} opacity="0.08" />
            <path d={pathD} fill="none" stroke={color} strokeWidth="1.5" vectorEffect="non-scaling-stroke" />
          </svg>
          {/* Dots + hover zones */}
          <div className="absolute inset-0">
            {points.map((p, i) => (
              <div
                key={i}
                className="absolute cursor-pointer"
                style={{ left: `${p.x}%`, top: `${p.y}%`, transform: "translate(-50%, -50%)", width: 24, height: 24 }}
                onMouseEnter={() => setHovered(i)}
                onMouseLeave={() => setHovered(null)}
              >
                {/* Dot — perfect circle */}
                <div
                  className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full transition-all duration-150"
                  style={{
                    width: hovered === i ? 8 : 5,
                    height: hovered === i ? 8 : 5,
                    backgroundColor: color,
                    boxShadow: hovered === i ? `0 0 8px ${color}50` : "none",
                  }}
                />
                {/* Tooltip */}
                {hovered === i && (
                  <div className="absolute -top-9 left-1/2 -translate-x-1/2 rounded-lg bg-[var(--bg-elevated)] px-3 py-1.5 text-xs font-medium text-[var(--text-primary)] shadow-lg z-10 whitespace-nowrap border border-[var(--border-subtle)]">
                    <span className="text-[var(--text-muted)]">{data[i].label}:</span> {valuePrefix}{p.value.toLocaleString()}{valueSuffix}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>
      {/* X Labels */}
      <div className="mt-2 flex justify-between pl-8">
        {data.length > 0 && <span className="text-[10px] text-[var(--text-muted)]">{data[0].label}</span>}
        {data.length > 2 && <span className="text-[10px] text-[var(--text-muted)]">{data[Math.floor(data.length / 2)].label}</span>}
        {data.length > 1 && <span className="text-[10px] text-[var(--text-muted)]">{data[data.length - 1].label}</span>}
      </div>
    </div>
  );
}

// ─── Multi-line chart (overlaid metrics) ─────────────────────

interface Series {
  label: string;
  data: DataPoint[];
  color: string;
}

interface SimpleMultiLineChartProps {
  series: Series[];
  title: string;
  height?: number;
}

export function SimpleMultiLineChart({ series, title, height = 200 }: SimpleMultiLineChartProps) {
  const [hovered, setHovered] = useState<number | null>(null);

  if (series.length === 0) return null;

  const labels = series[0].data.map((d) => d.label);
  const globalMax = Math.max(...series.flatMap((s) => s.data.map((d) => d.value)), 1);
  const globalMin = Math.min(...series.flatMap((s) => s.data.map((d) => d.value)));
  const range = globalMax - globalMin || 1;

  const seriesPaths = series.map((s) => {
    const points = s.data.map((d, i) => {
      const x = (i / Math.max(s.data.length - 1, 1)) * 100;
      const y = 100 - ((d.value - globalMin) / range) * 85 - 8;
      return { x, y, value: d.value };
    });
    const pathD = points.map((p, i) => `${i === 0 ? "M" : "L"} ${p.x} ${p.y}`).join(" ");
    return { ...s, points, pathD };
  });

  return (
    <div>
      <div className="mb-3 flex items-baseline justify-between">
        <h3 className="text-[15px] font-semibold text-[var(--text-primary)]">{title}</h3>
        {hovered !== null && (
          <span className="text-xs text-[var(--text-muted)] tabular-nums">{labels[hovered]}</span>
        )}
      </div>
      {/* Legend */}
      <div className="mb-3 flex flex-wrap gap-4">
        {series.map((s) => (
          <div key={s.label} className="flex items-center gap-1.5 text-xs">
            <div className="h-2 w-2 rounded-full" style={{ backgroundColor: s.color }} />
            <span className="text-[var(--text-secondary)]">{s.label}</span>
            {hovered !== null && (
              <span className="font-medium text-[var(--text-primary)] tabular-nums ml-1">
                {s.data[hovered]?.value.toLocaleString()}
              </span>
            )}
          </div>
        ))}
      </div>
      <div style={{ height }} className="relative">
        <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="w-full h-full">
          {seriesPaths.map((s) => (
            <Fragment key={s.label}>
              <path d={`${s.pathD} L 100 100 L 0 100 Z`} fill={s.color} opacity="0.06" />
              <path d={s.pathD} fill="none" stroke={s.color} strokeWidth="1.5" vectorEffect="non-scaling-stroke" />
            </Fragment>
          ))}
        </svg>
        {/* Dots — HTML for perfect circles */}
        <div className="absolute inset-0 pointer-events-none">
          {seriesPaths.map((s) =>
            s.points.map((p, i) => (
              <div
                key={`${s.label}-dot-${i}`}
                className="absolute rounded-full transition-all duration-150"
                style={{
                  left: `${p.x}%`,
                  top: `${p.y}%`,
                  transform: "translate(-50%, -50%)",
                  width: hovered === i ? 7 : 4,
                  height: hovered === i ? 7 : 4,
                  backgroundColor: s.color,
                  boxShadow: hovered === i ? `0 0 6px ${s.color}50` : "none",
                }}
              />
            ))
          )}
        </div>
        {/* Hover columns for interaction */}
        <div className="absolute inset-0 flex">
          {labels.map((_, i) => (
            <div
              key={i}
              className="flex-1 cursor-pointer relative"
              onMouseEnter={() => setHovered(i)}
              onMouseLeave={() => setHovered(null)}
            >
              {hovered === i && <div className="absolute inset-0 bg-[var(--text-primary)] opacity-[0.03]" />}
              {hovered === i && (
                <div className="absolute -top-2 left-1/2 -translate-x-1/2 -translate-y-full rounded-lg bg-[var(--bg-elevated)] px-3 py-2 text-xs shadow-lg z-10 whitespace-nowrap border border-[var(--border-subtle)]">
                  <p className="text-[var(--text-muted)] mb-1">{labels[i]}</p>
                  {seriesPaths.map((s) => (
                    <div key={s.label} className="flex items-center gap-1.5">
                      <div className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: s.color }} />
                      <span className="text-[var(--text-secondary)]">{s.label}:</span>
                      <span className="font-medium text-[var(--text-primary)] tabular-nums">{s.data[i]?.value.toLocaleString()}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
      {/* X labels */}
      <div className="mt-2 flex justify-between">
        {labels.length > 0 && <span className="text-[10px] text-[var(--text-muted)]">{labels[0]}</span>}
        {labels.length > 2 && <span className="text-[10px] text-[var(--text-muted)]">{labels[Math.floor(labels.length / 2)]}</span>}
        {labels.length > 1 && <span className="text-[10px] text-[var(--text-muted)]">{labels[labels.length - 1]}</span>}
      </div>
    </div>
  );
}
