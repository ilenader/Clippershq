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
}

export function ServerStrip({ campaigns, selectedId, onSelect }: Props) {
  return (
    <div className="w-[72px] flex-shrink-0 bg-[var(--bg-primary)] flex flex-col py-3 gap-2 overflow-y-auto border-r border-[var(--border-color)]">
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
            {/* Active pill — flush with left wall */}
            {active && (
              <span className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-10 bg-white rounded-r-full transition-all duration-200" />
            )}
            {!active && (
              <span className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-0 group-hover:h-5 bg-white rounded-r-full transition-all duration-200" />
            )}

            <div
              className={`h-12 w-12 overflow-hidden transition-all duration-200 ${
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
    <div className="absolute left-full ml-4 top-1/2 -translate-y-1/2 px-3 py-1.5 rounded-lg bg-[#111] text-white text-sm font-medium whitespace-nowrap opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity duration-200 delay-150 z-[60] shadow-xl">
      {children}
    </div>
  );
}
