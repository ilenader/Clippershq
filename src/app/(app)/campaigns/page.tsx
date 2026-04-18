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
  const [favorites, setFavorites] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);

  // Join system state
  const [joinedCampaignIds, setJoinedCampaignIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    Promise.all([
      fetch("/api/campaigns").then((r) => r.json()),
      fetch("/api/campaign-accounts").then((r) => r.json()),
    ])
      .then(([campaignData, joinsData]) => {
        const arr = Array.isArray(campaignData) ? campaignData : [];
        setCampaigns(arr.filter((c: any) => c.status === "ACTIVE" || c.status === "PAUSED"));
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

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-[var(--text-primary)]">Campaigns</h1>
        <p className="text-[15px] text-[var(--text-secondary)]">Browse campaigns and join to start submitting clips.</p>
      </div>

      {campaigns.length === 0 ? (
        <EmptyState
          icon={<Megaphone className="h-10 w-10" />}
          title="No campaigns available"
          description="There are no campaigns available right now. Check back soon."
        />
      ) : (
        <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
          {[...campaigns].sort((a: any, b: any) => {
            const aStarred = favorites.includes(a.id) ? 0 : 1;
            const bStarred = favorites.includes(b.id) ? 0 : 1;
            if (aStarred !== bStarred) return aStarred - bStarred;
            const aActive = a.status === "ACTIVE" ? 0 : 1;
            const bActive = b.status === "ACTIVE" ? 0 : 1;
            if (aActive !== bActive) return aActive - bActive;
            return (a.name || "").localeCompare(b.name || "");
          }).map((campaign: any) => {
            const isJoined = joinedCampaignIds.has(campaign.id);

            return (
              <div key={campaign.id} className="relative">
                <CampaignCard
                  campaign={campaign}
                  href={`/campaigns/${campaign.id}`}
                  className={campaign.status === "PAUSED" ? "opacity-70" : ""}
                >
                  {isClipper && (
                    isJoined ? (
                      <span className="px-3 py-1 rounded-lg bg-emerald-500/20 text-emerald-400 text-xs font-semibold">
                        Joined
                      </span>
                    ) : campaign.status === "ACTIVE" ? (
                      <span className="px-3 py-1 rounded-lg bg-accent text-white text-xs font-semibold group-hover:bg-accent/80 transition-colors">
                        Join Campaign
                      </span>
                    ) : null
                  )}
                </CampaignCard>
                {/* Favorite star — overlaid top-right */}
                <button
                  onClick={(e) => toggleFavorite(e, campaign.id)}
                  className="absolute top-3 right-3 z-10 rounded-lg p-1.5 transition-colors cursor-pointer hover:bg-black/30 backdrop-blur-sm"
                >
                  <Star className={`h-4 w-4 ${favorites.includes(campaign.id) ? "fill-accent text-accent" : "text-white/60"}`} />
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
