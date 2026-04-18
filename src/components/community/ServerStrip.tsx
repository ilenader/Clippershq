"use client";

import { MessageCircle } from "lucide-react";

interface StripCampaign {
  id: string;
  name: string;
  imageUrl?: string | null;
  totalUnread?: number;
}

interface Props {
  campaigns: StripCampaign[];
  selectedId: string | null;
  onSelect: (id: string | null) => void;
}

/**
 * Discord-style vertical rail of campaign icons. 72px wide on desktop; lives
 * between the main app sidebar and the ChannelList panel. The Home button
 * (null selection) returns the user to the community overview.
 */
export function ServerStrip({ campaigns, selectedId, onSelect }: Props) {
  return (
    <div className="w-[72px] flex-shrink-0 bg-[#1a1f2e] flex flex-col items-center py-3 gap-2 overflow-y-auto border-r border-[var(--border-color)]">
      {/* Home */}
      <button
        onClick={() => onSelect(null)}
        className="relative group"
        aria-label="Community home"
      >
        <div
          className={`h-12 w-12 flex items-center justify-center transition-all duration-200 ${
            !selectedId
              ? "bg-accent rounded-xl"
              : "bg-[var(--bg-card)] rounded-2xl hover:bg-accent hover:rounded-xl"
          }`}
        >
          <MessageCircle className="h-5 w-5 text-white" />
        </div>
        {!selectedId && (
          <span className="absolute left-[-4px] top-1/2 -translate-y-1/2 w-1 h-5 bg-white rounded-r-full" />
        )}
        <Tooltip>Home</Tooltip>
      </button>

      {/* Separator */}
      <div className="w-8 h-px bg-[var(--border-color)] my-1" />

      {/* Campaigns */}
      {campaigns.map((c) => {
        const active = selectedId === c.id;
        const unread = c.totalUnread || 0;
        return (
          <button
            key={c.id}
            onClick={() => onSelect(c.id)}
            className="relative group"
            aria-label={c.name}
          >
            <div
              className={`h-12 w-12 overflow-hidden transition-all duration-200 ${
                active ? "rounded-xl" : "rounded-2xl hover:rounded-xl"
              }`}
            >
              {c.imageUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={c.imageUrl} alt="" className="h-full w-full object-cover" />
              ) : (
                <div className="h-full w-full bg-[var(--bg-card)] flex items-center justify-center text-accent font-bold text-lg">
                  {c.name?.[0]?.toUpperCase() || "?"}
                </div>
              )}
            </div>

            {/* Active indicator */}
            {active && (
              <span className="absolute left-[-4px] top-1/2 -translate-y-1/2 w-1 h-5 bg-white rounded-r-full" />
            )}
            {/* Hover indicator (grows on hover) */}
            {!active && (
              <span className="absolute left-[-4px] top-1/2 -translate-y-1/2 w-1 h-0 group-hover:h-3 bg-white rounded-r-full transition-all duration-200" />
            )}

            {/* Unread badge */}
            {!active && unread > 0 && (
              <span className="absolute -bottom-0.5 -right-0.5 h-5 min-w-5 rounded-full bg-red-500 text-white text-[10px] font-bold flex items-center justify-center px-1 border-2 border-[#1a1f2e] tabular-nums">
                {unread > 99 ? "99+" : unread}
              </span>
            )}

            <Tooltip>{c.name}</Tooltip>
          </button>
        );
      })}
    </div>
  );
}

function Tooltip({ children }: { children: React.ReactNode }) {
  return (
    <div className="absolute left-full ml-3 top-1/2 -translate-y-1/2 px-3 py-1.5 rounded-lg bg-[#111] text-white text-sm font-medium whitespace-nowrap opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity z-50 max-w-[200px] truncate shadow-xl">
      {children}
    </div>
  );
}
