"use client";

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import type { SessionUser } from "@/lib/auth-types";
import { useRouter } from "next/navigation";
import { EmptyState } from "@/components/ui/empty-state";
import { CampaignCard } from "@/components/ui/campaign-card";
import { Megaphone, Star } from "lucide-react";

export default function CampaignsPage() {
  const { data: session } = useSession();
  const router = useRouter();
  const userRole = (session?.user as SessionUser)?.role || "CLIPPER";
  const isClipper = userRole === "CLIPPER";

  useEffect(() => {
    if (session && userRole && userRole !== "CLIPPER") {
      router.replace("/admin/campaigns");
    }
  }, [session, userRole, router]);

  const [campaigns, setCampaigns] = useState<any[]>([]);
  const [pastCampaigns, setPastCampaigns] = useState<any[]>([]);
  const [spendByCampaign, setSpendByCampaign] = useState<Record<string, number>>({});
  const [favorites, setFavorites] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [joinedCampaignIds, setJoinedCampaignIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    Promise.all([
      fetch("/api/campaigns").then((r) => r.json()),
      fetch("/api/campaigns/spend").then((r) => r.json()),
      fetch("/api/campaign-accounts").then((r) => r.json()),
      fetch("/api/campaigns/past").then((r) => r.json()).catch(() => []),
    ])
      .then(([campaignData, spendData, joinsData, pastData]) => {
        const arr = Array.isArray(campaignData) ? campaignData : [];
        setCampaigns(arr.filter((c: any) => c.status === "ACTIVE" || c.status === "PAUSED"));
        setPastCampaigns(Array.isArray(pastData) ? pastData : []);
        setSpendByCampaign(typeof spendData === "object" && spendData !== null ? spendData : {});
        const joinsArr = Array.isArray(joinsData) ? joinsData : [];
        setJoinedCampaignIds(new Set(joinsArr.map((j: any) => j.campaignId)));
      })
      .catch(() => {})
      .finally(() => setLoading(false));

    try {
      const saved = localStorage.getItem("clippers_hq_favorites");
      if (saved) setFavorites(JSON.parse(saved));
    } catch {}
  }, []);

  const toggleFavorite = (e: React.MouseEvent, campaignId: string) => {
    e.preventDefault();
    e.stopPropagation();
    setFavorites((prev) => {
      const updated = prev.includes(campaignId)
        ? prev.filter((id) => id !== campaignId)
        : [...prev, campaignId];
      localStorage.setItem("clippers_hq_favorites", JSON.stringify(updated));
      return updated;
    });
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-[var(--border-color)] border-t-accent" />
      </div>
    );
  }

  const sortFn = (a: any, b: any) => {
    const aStarred = favorites.includes(a.id) ? 0 : 1;
    const bStarred = favorites.includes(b.id) ? 0 : 1;
    if (aStarred !== bStarred) return aStarred - bStarred;
    return (a.name || "").localeCompare(b.name || "");
  };
  const activeCampaigns = campaigns.filter((c: any) => c.status === "ACTIVE").sort(sortFn);
  const pausedCampaigns = campaigns.filter((c: any) => c.status === "PAUSED").sort(sortFn);
  // pastCampaigns already sorted updatedAt desc by the API.

  const renderCard = (campaign: any, index: number) => {
    const isJoined = joinedCampaignIds.has(campaign.id);
    const isFav = favorites.includes(campaign.id);
    return (
      <div key={campaign.id} className="relative">
        <CampaignCard
          campaign={campaign}
          href={`/campaigns/${campaign.id}`}
          budget={campaign.budget}
          spent={spendByCampaign[campaign.id] || 0}
          index={index}
        >
          {isClipper && (
            isJoined ? (
              <span className="px-6 py-2.5 rounded-xl bg-emerald-500/20 text-emerald-400 text-sm font-bold w-full text-center block">
                Joined
              </span>
            ) : campaign.status === "ACTIVE" ? (
              <span className="px-6 py-2.5 rounded-xl bg-accent text-white text-sm font-bold w-full text-center block group-hover:bg-accent/80 transition-colors">
                Join Campaign
              </span>
            ) : (
              <span className="px-6 py-2.5 rounded-xl bg-amber-500/20 text-amber-400 text-sm font-bold w-full text-center block">
                Campaign Paused
              </span>
            )
          )}
        </CampaignCard>
        <button
          onClick={(e) => toggleFavorite(e, campaign.id)}
          className="absolute top-2 right-2 z-10 rounded-lg p-1 transition-colors cursor-pointer hover:bg-black/30 backdrop-blur-sm"
        >
          <Star
            className={`h-3.5 w-3.5 transition-all ${isFav ? "fill-accent text-accent animate-[starPop_0.3s_ease-out]" : "text-white/60"}`}
          />
        </button>
      </div>
    );
  };

  const nothingToShow = activeCampaigns.length === 0 && pausedCampaigns.length === 0 && pastCampaigns.length === 0;

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-[var(--text-primary)]">Campaigns</h1>
        <p className="text-[15px] text-[var(--text-secondary)]">Browse campaigns and join to start submitting clips.</p>
      </div>

      {nothingToShow && (
        <EmptyState
          icon={<Megaphone className="h-10 w-10" />}
          title="No campaigns available"
          description="There are no campaigns available right now. Check back soon."
        />
      )}

      {/* Active */}
      {activeCampaigns.length > 0 && (
        <section>
          <h2 className="text-lg font-semibold text-[var(--text-primary)] mb-3">Active Campaigns</h2>
          <div className="grid gap-3 md:gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {activeCampaigns.map(renderCard)}
          </div>
        </section>
      )}

      {/* Paused */}
      {pausedCampaigns.length > 0 && (
        <section>
          <h2 className="text-lg font-semibold text-[var(--text-primary)] mb-3">Paused Campaigns</h2>
          <p className="text-sm text-[var(--text-muted)] -mt-2 mb-3">Temporarily paused — they'll resume when budget or review unblocks them.</p>
          <div className="grid gap-3 md:gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 opacity-80">
            {pausedCampaigns.map(renderCard)}
          </div>
        </section>
      )}

      {/* Past — horizontal scroll, non-clickable */}
      {pastCampaigns.length > 0 && (
        <section>
          <h2 className="text-lg font-semibold text-[var(--text-primary)] mb-1">Past Campaigns</h2>
          <p className="text-sm text-[var(--text-muted)] mb-3">Previous successful campaigns we've run.</p>
          <div
            className="flex gap-3 overflow-x-auto snap-x snap-mandatory pb-2 -mx-4 px-4 sm:mx-0 sm:px-0"
            style={{
              scrollbarWidth: "none",
              msOverflowStyle: "none",
              WebkitOverflowScrolling: "touch" as any,
            }}
          >
            <style>{`.past-scroll::-webkit-scrollbar{display:none}`}</style>
            {pastCampaigns.map((c: any, i: number) => (
              <div
                key={c.id}
                className="flex-shrink-0 w-[85%] sm:w-[45%] md:w-[40%] lg:w-[30%] xl:w-[23%] snap-center"
              >
                <CampaignCard
                  campaign={c}
                  href={`/campaigns/${c.id}`}
                  budget={c.budget}
                  spent={spendByCampaign[c.id] || 0}
                  index={i}
                  isPast
                />
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
