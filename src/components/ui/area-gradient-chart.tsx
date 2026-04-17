"use client";

import { useId } from "react";
import {
  ResponsiveContainer, AreaChart, Area, XAxis, YAxis, Tooltip, CartesianGrid,
} from "recharts";

interface DataPoint {
  label: string;
  value: number;
}

interface AreaGradientChartProps {
  data: DataPoint[];
  title?: string;
  color?: string;
  height?: number;
  valuePrefix?: string;
  valueSuffix?: string;
  /** Override the default "Nk" formatter for the Y-axis. */
  yAxisFormatter?: (value: number) => string;
}

// Axis label — compact form ("73k", "1.2m") so the Y-axis doesn't overflow.
function formatAxis(v: number, prefix: string, suffix: string): string {
  const abs = Math.abs(v);
  let core: string;
  if (abs >= 1_000_000) core = `${(v / 1_000_000).toFixed(1).replace(/\.0$/, "")}m`;
  else if (abs >= 1000) core = `${(v / 1000).toFixed(0)}k`;
  else core = String(v);
  return `${prefix}${core}${suffix}`;
}

// Tooltip label — full precision with comma separators, integer money (no .00 tail).
function formatTooltip(v: number, prefix: string, suffix: string): string {
  const rounded = Math.round(v);
  return `${prefix}${rounded.toLocaleString()}${suffix}`;
}

/** Single-series gradient area chart — mirrors the client-dashboard recharts config. */
export function AreaGradientChart({
  data,
  title,
  color = "#2596be",
  height = 220,
  valuePrefix = "",
  valueSuffix = "",
  yAxisFormatter,
}: AreaGradientChartProps) {
  const gradientId = `area-grad-${useId().replace(/:/g, "")}`;
  const hasData = data.some((d) => d.value > 0);

  const tickFormatter = yAxisFormatter
    ? yAxisFormatter
    : (v: number) => formatAxis(v, valuePrefix, valueSuffix);

  return (
    <div>
      {title && (
        <div className="mb-3 flex items-baseline justify-between">
          <h3 className="text-[15px] font-semibold text-[var(--text-primary)]">{title}</h3>
        </div>
      )}
      {hasData ? (
        <div style={{ height }}>
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={data} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
              <defs>
                <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={color} stopOpacity={0.3} />
                  <stop offset="100%" stopColor={color} stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
              <XAxis
                dataKey="label"
                tick={{ fill: "rgba(255,255,255,0.35)", fontSize: 11 }}
                axisLine={{ stroke: "rgba(255,255,255,0.08)" }}
                tickLine={false}
              />
              <YAxis
                tick={{ fill: "rgba(255,255,255,0.35)", fontSize: 11 }}
                axisLine={false}
                tickLine={false}
                tickFormatter={tickFormatter}
              />
              <Tooltip
                cursor={{ stroke: "rgba(255,255,255,0.08)", strokeWidth: 1 }}
                content={({ active, payload, label }) => {
                  if (!active || !payload || payload.length === 0) return null;
                  const v = Number((payload[0] as any).value);
                  return (
                    <div className="rounded-lg border border-[var(--border-color)] bg-[var(--bg-card)] px-3 py-1.5 text-xs">
                      <p className="whitespace-nowrap">
                        <span className="text-[var(--text-muted)]">{label}</span>
                        <span className="text-[var(--text-muted)]"> — </span>
                        <span className="font-semibold text-[var(--text-primary)] tabular-nums">{formatTooltip(v, valuePrefix, valueSuffix)}</span>
                      </p>
                    </div>
                  );
                }}
              />
              <Area
                type="monotone"
                dataKey="value"
                stroke={color}
                strokeWidth={2}
                fill={`url(#${gradientId})`}
                dot={false}
                activeDot={{ r: 4, fill: color, stroke: "#fff", strokeWidth: 2 }}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      ) : (
        <div style={{ height }} className="flex items-center justify-center">
          <p className="text-sm text-[var(--text-muted)]">No data yet</p>
        </div>
      )}
    </div>
  );
}

interface Series {
  label: string;
  data: DataPoint[];
  color: string;
}

interface MultiAreaGradientChartProps {
  series: Series[];
  title?: string;
  height?: number;
}

/** Multi-series gradient area chart — one translucent gradient per series on shared axes. */
export function MultiAreaGradientChart({ series, title, height = 220 }: MultiAreaGradientChartProps) {
  const baseId = useId().replace(/:/g, "");

  if (series.length === 0) {
    return (
      <div style={{ height }} className="flex items-center justify-center">
        <p className="text-sm text-[var(--text-muted)]">No data yet</p>
      </div>
    );
  }

  // Build merged dataset keyed by label so recharts can render multiple Area lines.
  const labels = series[0].data.map((d) => d.label);
  const merged = labels.map((label, i) => {
    const row: Record<string, any> = { label };
    for (const s of series) {
      row[s.label] = s.data[i]?.value ?? 0;
    }
    return row;
  });

  const hasData = series.some((s) => s.data.some((d) => d.value > 0));

  return (
    <div>
      {title && (
        <div className="mb-3 flex items-baseline justify-between">
          <h3 className="text-[15px] font-semibold text-[var(--text-primary)]">{title}</h3>
        </div>
      )}
      {/* Legend */}
      <div className="mb-3 flex flex-wrap gap-4">
        {series.map((s) => (
          <div key={s.label} className="flex items-center gap-1.5 text-xs">
            <div className="h-2 w-2 rounded-full" style={{ backgroundColor: s.color }} />
            <span className="text-[var(--text-secondary)]">{s.label}</span>
          </div>
        ))}
      </div>
      {hasData ? (
        <div style={{ height }}>
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={merged} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
              <defs>
                {series.map((s, i) => (
                  <linearGradient key={s.label} id={`${baseId}-${i}`} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={s.color} stopOpacity={0.25} />
                    <stop offset="100%" stopColor={s.color} stopOpacity={0} />
                  </linearGradient>
                ))}
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
              <XAxis
                dataKey="label"
                tick={{ fill: "rgba(255,255,255,0.35)", fontSize: 11 }}
                axisLine={{ stroke: "rgba(255,255,255,0.08)" }}
                tickLine={false}
              />
              <YAxis
                tick={{ fill: "rgba(255,255,255,0.35)", fontSize: 11 }}
                axisLine={false}
                tickLine={false}
                tickFormatter={(v: number) => formatAxis(v, "", "")}
              />
              <Tooltip
                cursor={{ stroke: "rgba(255,255,255,0.08)", strokeWidth: 1 }}
                content={({ active, payload, label }) => {
                  if (!active || !payload || payload.length === 0) return null;
                  return (
                    <div className="rounded-lg border border-[var(--border-color)] bg-[var(--bg-card)] px-3 py-2 text-xs">
                      <p className="text-[var(--text-muted)] mb-1 whitespace-nowrap">{label}</p>
                      {payload.map((entry: any) => (
                        <p key={entry.dataKey} className="whitespace-nowrap flex items-center gap-1.5">
                          <span className="inline-block h-1.5 w-1.5 rounded-full flex-shrink-0" style={{ backgroundColor: entry.color }} />
                          <span className="text-[var(--text-secondary)]">{entry.dataKey}:</span>
                          <span className="font-semibold text-[var(--text-primary)] tabular-nums">{formatTooltip(Number(entry.value), "", "")}</span>
                        </p>
                      ))}
                    </div>
                  );
                }}
              />
              {series.map((s, i) => (
                <Area
                  key={s.label}
                  type="monotone"
                  dataKey={s.label}
                  stroke={s.color}
                  strokeWidth={2}
                  fill={`url(#${baseId}-${i})`}
                  dot={false}
                  activeDot={{ r: 4, fill: s.color, stroke: "#fff", strokeWidth: 2 }}
                />
              ))}
            </AreaChart>
          </ResponsiveContainer>
        </div>
      ) : (
        <div style={{ height }} className="flex items-center justify-center">
          <p className="text-sm text-[var(--text-muted)]">No data yet</p>
        </div>
      )}
    </div>
  );
}
