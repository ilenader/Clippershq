"use client";

import Link from "next/link";
import { useState } from "react";

interface CampaignCardProps {
  campaign: {
    id: string;
    name: string;
    imageUrl?: string | null;
    platform?: string;
    status?: string;
    clipperCpm?: number;
    cpmRate?: number;
    minViews?: number;
    maxPayoutPerClip?: number;
    maxClipsPerUserPerDay?: number;
    targetAudience?: string | null;
    targetCountries?: string | null;
  };
  href: string;
  children?: React.ReactNode;
  showStats?: boolean;
  budget?: number;
  spent?: number;
  index?: number;
  className?: string;
}

function formatViews(n: number): string {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(n % 1_000_000 === 0 ? 0 : 1) + "M";
  if (n >= 1_000) return (n / 1_000).toFixed(n % 1_000 === 0 ? 0 : 1) + "K";
  return String(n);
}

export function CampaignCard({ campaign, href, children, showStats = true, budget, spent, index, className = "" }: CampaignCardProps) {
  const [imgError, setImgError] = useState(false);

  const cpm = campaign.clipperCpm ?? campaign.cpmRate ?? null;
  const hasStats = showStats && (
    (cpm != null && cpm > 0) ||
    (campaign.minViews != null && campaign.minViews > 0) ||
    (campaign.maxPayoutPerClip != null && campaign.maxPayoutPerClip > 0) ||
    (campaign.maxClipsPerUserPerDay != null && campaign.maxClipsPerUserPerDay > 0)
  );

  const progressPct = budget && budget > 0
    ? Math.min(((spent || 0) / budget) * 100, 100)
    : 100;

  const audienceLabel = campaign.targetAudience === "usa" ? "USA Audience"
    : campaign.targetAudience === "first_world" ? "First World"
    : campaign.targetAudience === "worldwide" ? "Worldwide"
    : campaign.targetAudience === "custom" ? (() => {
        try {
          const countries: string[] = JSON.parse(campaign.targetCountries || "[]");
          const display = countries.slice(0, 3).join(", ");
          return countries.length > 3 ? display + "\u2026" : display;
        } catch { return "Custom"; }
      })()
    : null;

  const audienceColor = campaign.targetAudience === "usa" ? "text-blue-400"
    : campaign.targetAudience === "first_world" ? "text-emerald-400"
    : campaign.targetAudience === "worldwide" ? "text-purple-400"
    : "text-amber-400";

  return (
    <Link href={href} className={`block group ${className}`}>
      <style jsx global>{`
        @keyframes fadeUp {
          from { opacity: 0; transform: translateY(12px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @keyframes starPop {
          0% { transform: scale(1); }
          50% { transform: scale(1.3); }
          100% { transform: scale(1); }
        }
      `}</style>
      <div
        className="relative w-full rounded-xl overflow-hidden border border-white/20 transition-all duration-300 ease-out group-hover:border-white/40 group-hover:shadow-lg group-hover:shadow-accent/5 opacity-0 animate-[fadeUp_0.5s_cubic-bezier(0.16,1,0.3,1)_forwards]"
        style={index != null ? { animationDelay: `${index * 80}ms` } : undefined}
      >
        {/* Image section */}
        <div className="relative aspect-[16/10] overflow-hidden">
          {campaign.imageUrl && !imgError ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={campaign.imageUrl}
              alt=""
              loading="lazy"
              onError={() => setImgError(true)}
              className="absolute inset-0 w-full h-full object-cover transition-transform duration-300 ease-out group-hover:scale-[1.03]"
            />
          ) : (
            <div className="absolute inset-0 bg-gradient-to-br from-accent/20 to-accent/5 flex items-center justify-center">
              <span className="text-4xl font-bold text-accent/30">{campaign.name?.[0]?.toUpperCase() || "?"}</span>
            </div>
          )}

          {/* Top gradient ONLY */}
          <div className="absolute inset-x-0 top-0 h-1/2 bg-gradient-to-b from-black/90 via-black/60 to-transparent" />

          {/* Name overlay */}
          <div className="absolute top-0 inset-x-0 p-4 pr-12">
            <h3 className="text-base lg:text-lg font-bold text-white drop-shadow-lg leading-tight line-clamp-2">
              {campaign.name}
            </h3>
            {campaign.platform && (
              <p className="text-xs text-white/50 mt-0.5">{campaign.platform.replace(/,\s*/g, " \u00b7 ")}</p>
            )}
          </div>
        </div>

        {/* Budget progress bar */}
        {budget != null && budget > 0 ? (
          <div className="px-3 pt-2 pb-1.5 bg-[var(--bg-primary)]">
            <div className="flex items-center justify-between mb-1">
              <span className="text-xs font-medium text-[var(--text-primary)]">${(spent || 0).toLocaleString()} of ${budget.toLocaleString()}</span>
              <span className="text-xs font-bold text-accent">{Math.round(((spent || 0) / budget) * 100)}%</span>
            </div>
            <div className="h-2 w-full rounded-full bg-[var(--bg-input)] overflow-hidden">
              <div
                className="h-full rounded-full bg-accent transition-all duration-300 ease-out"
                style={{ width: `${progressPct}%` }}
              />
            </div>
          </div>
        ) : (
          <div className="h-1 w-full bg-[var(--bg-input)]">
            <div className="h-full bg-accent w-full" />
          </div>
        )}

        {/* Solid stats block */}
        <div className="bg-[var(--bg-primary)] p-4 border-t border-white/10 transition-transform duration-300 ease-out group-hover:-translate-y-1 space-y-3">
          {hasStats && (
            <div className="flex items-center justify-between gap-2">
              {campaign.minViews != null && campaign.minViews > 0 && (
                <div className="text-center flex-1">
                  <p className="text-[9px] uppercase tracking-widest text-[var(--text-muted)] mb-0.5">Min Views</p>
                  <p className="text-xl font-bold text-[var(--text-primary)]">{formatViews(campaign.minViews)}</p>
                </div>
              )}
              {cpm != null && cpm > 0 && (
                <div className="text-center flex-1">
                  <p className="text-[9px] uppercase tracking-widest text-[var(--text-muted)] mb-0.5">CPM</p>
                  <p className="text-xl font-bold text-accent">${cpm.toFixed(2)}</p>
                </div>
              )}
              {campaign.maxPayoutPerClip != null && campaign.maxPayoutPerClip > 0 && (
                <div className="text-center flex-1">
                  <p className="text-[9px] uppercase tracking-widest text-[var(--text-muted)] mb-0.5">Max/Clip</p>
                  <p className="text-xl font-bold text-[var(--text-primary)]">${campaign.maxPayoutPerClip}</p>
                </div>
              )}
              {campaign.maxClipsPerUserPerDay != null && campaign.maxClipsPerUserPerDay > 0 && (
                <div className="text-center flex-1">
                  <p className="text-[9px] uppercase tracking-widest text-[var(--text-muted)] mb-0.5">Daily Limit</p>
                  <p className="text-xl font-bold text-[var(--text-primary)]">{campaign.maxClipsPerUserPerDay}</p>
                </div>
              )}
            </div>
          )}

          {children && (
            <div className="flex justify-center">
              {children}
            </div>
          )}

          {audienceLabel && (
            <p className={`text-xs font-semibold text-right ${audienceColor}`}>
              {audienceLabel}
            </p>
          )}
        </div>
      </div>
    </Link>
  );
}
