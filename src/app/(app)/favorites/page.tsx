"use client";

import { useEffect, useState } from "react";
import { Card, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { formatCurrency, formatNumber } from "@/lib/utils";
import { Star } from "lucide-react";
import Link from "next/link";

export default function FavoritesPage() {
  const [campaigns, setCampaigns] = useState<any[]>([]);
  const [clipsByCampaign, setClipsByCampaign] = useState<Record<string, number>>({});
  const [favorites, setFavorites] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    try {
      const saved = localStorage.getItem("clippers_hq_favorites");
      if (saved) setFavorites(JSON.parse(saved));
    } catch {}

    Promise.all([
      fetch("/api/campaigns").then((r) => r.json()),
      fetch("/api/clips/mine").then((r) => r.json()),
    ])
      .then(([campaignData, clipsData]) => {
        setCampaigns(Array.isArray(campaignData) ? campaignData : []);
        const spendMap: Record<string, number> = {};
        const clips = Array.isArray(clipsData) ? clipsData : [];
        for (const clip of clips) {
          if (clip.campaignId && clip.earnings > 0) {
            spendMap[clip.campaignId] = (spendMap[clip.campaignId] || 0) + clip.earnings;
          }
        }
        setClipsByCampaign(spendMap);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const favoriteCampaigns = campaigns.filter((c: any) => favorites.includes(c.id));

  const removeFavorite = (e: React.MouseEvent, campaignId: string) => {
    e.preventDefault();
    e.stopPropagation();
    const updated = favorites.filter((id) => id !== campaignId);
    setFavorites(updated);
    localStorage.setItem("clippers_hq_favorites", JSON.stringify(updated));
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
        <h1 className="text-2xl font-bold text-[var(--text-primary)]">Favorite Campaigns</h1>
        <p className="text-[15px] text-[var(--text-secondary)]">Campaigns you&apos;ve saved for quick access.</p>
      </div>

      {favoriteCampaigns.length === 0 ? (
        <EmptyState
          icon={<Star className="h-10 w-10" />}
          title="No favorites yet"
          description="Star campaigns from the campaigns page to add them here."
        />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {favoriteCampaigns.map((campaign: any) => {
            const spent = clipsByCampaign[campaign.id] || 0;
            const budget = campaign.budget || 0;
            const pct = budget > 0 ? Math.min((spent / budget) * 100, 100) : 0;

            return (
              <Link key={campaign.id} href={`/campaigns/${campaign.id}`}>
                <Card hover className="h-full">
                  <div className="flex items-start gap-4">
                    {campaign.imageUrl && (
                      <div className="h-14 w-14 flex-shrink-0 overflow-hidden rounded-xl border border-[var(--border-color)]">
                        <img src={campaign.imageUrl} alt="" className="h-full w-full object-cover" />
                      </div>
                    )}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <CardTitle>{campaign.name}</CardTitle>
                          <CardDescription>{campaign.platform?.replace(/,\s*/g, " · ")}</CardDescription>
                        </div>
                        <button
                          onClick={(e) => removeFavorite(e, campaign.id)}
                          className="flex-shrink-0 rounded-lg p-1 transition-colors cursor-pointer hover:bg-accent/10"
                        >
                          <Star className="h-4 w-4 fill-accent text-accent" />
                        </button>
                      </div>
                    </div>
                  </div>

                  {/* Budget progress bar */}
                  {budget > 0 && (
                    <div className="mt-3">
                      <div className="flex items-center justify-between mb-1.5">
                        <span className="text-xs font-medium text-[var(--text-primary)]">
                          {formatCurrency(spent)} spent of {formatCurrency(budget)}
                        </span>
                        <Badge variant={campaign.status.toLowerCase() as any}>{campaign.status}</Badge>
                      </div>
                      <div className="h-2.5 rounded-full bg-[var(--bg-input)] border border-[var(--border-subtle)]">
                        <div className="h-full rounded-full bg-accent transition-all duration-500" style={{ width: `${Math.max(pct, 1)}%` }} />
                      </div>
                    </div>
                  )}
                  {!budget && (
                    <div className="mt-3">
                      <Badge variant={campaign.status.toLowerCase() as any}>{campaign.status}</Badge>
                    </div>
                  )}

                  <div className="mt-3 grid grid-cols-3 gap-3">
                    {campaign.cpmRate != null && campaign.cpmRate > 0 && (
                      <div>
                        <p className="text-xs text-[var(--text-muted)]">CPM</p>
                        <p className="text-sm font-semibold text-[var(--text-primary)]">{formatCurrency(campaign.cpmRate)}</p>
                      </div>
                    )}
                    {campaign.maxPayoutPerClip != null && campaign.maxPayoutPerClip > 0 && (
                      <div>
                        <p className="text-xs text-[var(--text-muted)]">Max / clip</p>
                        <p className="text-sm font-semibold text-[var(--text-primary)]">{formatCurrency(campaign.maxPayoutPerClip)}</p>
                      </div>
                    )}
                    {campaign.minViews != null && campaign.minViews > 0 && (
                      <div>
                        <p className="text-xs text-[var(--text-muted)]">Min views</p>
                        <p className="text-sm font-semibold text-[var(--text-primary)]">{formatNumber(campaign.minViews)}</p>
                      </div>
                    )}
                  </div>
                </Card>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
