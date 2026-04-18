"use client";

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
  compact?: boolean;
}

export function ServerStrip({ campaigns, selectedId, onSelect, compact }: Props) {
  const iconSize = compact ? "h-10 w-10" : "h-12 w-12";
  return (
    <div className={`${compact ? "w-14" : "w-[72px]"} flex-shrink-0 bg-[var(--bg-primary)] flex flex-col ${compact ? "py-2 gap-1.5" : "py-3 gap-2"} overflow-y-auto border-r border-[var(--border-color)]`}>
      {campaigns.map((c) => {
        const active = selectedId === c.id;
        const unread = c.totalUnread || 0;
        return (
          <button
            key={c.id}
            onClick={() => onSelect(c.id)}
            className="relative group w-full flex justify-center pl-[3px]"
            aria-label={c.name}
          >
            {active && (
              <span className={`absolute left-0 top-1/2 -translate-y-1/2 w-[3px] ${compact ? "h-8" : "h-10"} bg-white rounded-r-full transition-all duration-200`} />
            )}
            {!active && (
              <span className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-0 group-hover:h-5 bg-white rounded-r-full transition-all duration-200" />
            )}

            <div
              className={`${iconSize} overflow-hidden transition-all duration-200 ${
                active ? "rounded-xl" : "rounded-2xl group-hover:rounded-xl"
              }`}
            >
              {c.imageUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={c.imageUrl} alt="" className="h-full w-full object-cover transition-transform duration-200 group-hover:scale-110" />
              ) : (
                <div className="h-full w-full bg-[var(--bg-card)] flex items-center justify-center text-accent font-bold text-lg transition-transform duration-200 group-hover:scale-110">
                  {c.name?.[0]?.toUpperCase() || "?"}
                </div>
              )}
            </div>

            {!active && unread > 0 && (
              <span className="absolute -bottom-0.5 right-1 h-5 min-w-5 rounded-full bg-red-500 text-white text-[10px] font-bold flex items-center justify-center px-1 border-2 border-[var(--bg-primary)] tabular-nums">
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
    <div className="absolute left-[calc(100%+12px)] top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 pointer-events-none transition-all duration-200 delay-150 z-[60] scale-95 group-hover:scale-100">
      <div className="relative px-4 py-2.5 rounded-xl bg-[#111827] border border-white/10 shadow-xl shadow-black/40">
        <div className="absolute left-[-6px] top-1/2 -translate-y-1/2 w-3 h-3 rotate-45 bg-[#111827] border-l border-b border-white/10" />
        <p className="text-sm font-semibold text-white whitespace-nowrap relative z-10">{children}</p>
      </div>
    </div>
  );
}
