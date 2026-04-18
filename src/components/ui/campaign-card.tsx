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
    targetAudience?: string | null;
    targetCountries?: string | null;
  };
  href: string;
  children?: React.ReactNode;
  showStats?: boolean;
  className?: string;
}

export function CampaignCard({ campaign, href, children, showStats = true, className = "" }: CampaignCardProps) {
  const [imgError, setImgError] = useState(false);

  const cpm = campaign.clipperCpm ?? campaign.cpmRate ?? null;
  const hasStats = (cpm != null && cpm > 0) || (campaign.minViews != null && campaign.minViews > 0) || (campaign.maxPayoutPerClip != null && campaign.maxPayoutPerClip > 0);

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
      <div className="relative w-full aspect-[4/3] rounded-xl overflow-hidden border border-[var(--border-color)] transition-all duration-200 group-hover:border-accent/30 group-hover:shadow-lg group-hover:shadow-accent/5">
        {/* Background image */}
        {campaign.imageUrl && !imgError ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={campaign.imageUrl}
            alt=""
            loading="lazy"
            onError={() => setImgError(true)}
            className="absolute inset-0 w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
          />
        ) : (
          <div className="absolute inset-0 bg-gradient-to-br from-accent/20 to-accent/5 flex items-center justify-center">
            <span className="text-4xl font-bold text-accent/30">{campaign.name?.[0]?.toUpperCase() || "?"}</span>
          </div>
        )}

        {/* Top gradient */}
        <div className="absolute inset-x-0 top-0 h-1/2 bg-gradient-to-b from-black/80 via-black/40 to-transparent" />

        {/* Bottom gradient */}
        <div className="absolute inset-x-0 bottom-0 h-1/2 bg-gradient-to-t from-black/90 via-black/50 to-transparent" />

        {/* Campaign name */}
        <div className="absolute top-0 inset-x-0 p-4">
          <h3 className="text-base lg:text-lg font-bold text-white drop-shadow-lg leading-tight line-clamp-2">
            {campaign.name}
          </h3>
          {campaign.platform && (
            <p className="text-xs text-white/60 mt-0.5">{campaign.platform.replace(/,\s*/g, " \u00b7 ")}</p>
          )}
        </div>

        {/* Status badge — offset from top-right to avoid collision with overlaid star */}
        {campaign.status === "PAUSED" && (
          <div className="absolute top-3 right-12 px-2 py-0.5 rounded-md bg-amber-500/80 text-white text-[10px] font-bold uppercase">
            Paused
          </div>
        )}

        {/* Bottom content */}
        <div className="absolute bottom-0 inset-x-0 p-4">
          {showStats && hasStats && (
            <div className="flex items-center gap-4 mb-3">
              {campaign.minViews != null && campaign.minViews > 0 && (
                <div className="text-center">
                  <p className="text-[10px] text-white/50 uppercase tracking-wide">Min Views</p>
                  <p className="text-sm font-bold text-white">
                    {campaign.minViews >= 1000 ? (campaign.minViews / 1000).toFixed(campaign.minViews % 1000 === 0 ? 0 : 1) + "K" : campaign.minViews}
                  </p>
                </div>
              )}
              {cpm != null && cpm > 0 && (
                <div className="text-center">
                  <p className="text-[10px] text-white/50 uppercase tracking-wide">CPM</p>
                  <p className="text-sm font-bold text-white">${cpm.toFixed(2)}</p>
                </div>
              )}
              {campaign.maxPayoutPerClip != null && campaign.maxPayoutPerClip > 0 && (
                <div className="text-center">
                  <p className="text-[10px] text-white/50 uppercase tracking-wide">Max/Clip</p>
                  <p className="text-sm font-bold text-white">${campaign.maxPayoutPerClip}</p>
                </div>
              )}
            </div>
          )}

          <div className="flex items-end justify-between">
            <div>{children}</div>

            {audienceLabel && (
              <p className={`text-xs font-semibold ${audienceColor}`}>
                {audienceLabel}
              </p>
            )}
          </div>
        </div>
      </div>
    </Link>
  );
}
