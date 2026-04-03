"use client";

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { Card, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { Modal } from "@/components/ui/modal";
import { EmptyState } from "@/components/ui/empty-state";
import { formatCurrency, formatNumber } from "@/lib/utils";
import { Megaphone, Star, UserPlus, CheckCircle } from "lucide-react";
import { toast } from "sonner";
import Link from "next/link";

export default function CampaignsPage() {
  const { data: session } = useSession();
  const router = useRouter();
  const userRole = (session?.user as any)?.role || "CLIPPER";
  const isClipper = userRole === "CLIPPER";

  useEffect(() => {
    if (session && userRole && userRole !== "CLIPPER") {
      router.replace("/admin/campaigns");
    }
  }, [session, userRole, router]);

  const [campaigns, setCampaigns] = useState<any[]>([]);
  const [clipsByCampaign, setClipsByCampaign] = useState<Record<string, number>>({});
  const [favorites, setFavorites] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);

  // Join system state
  const [joinedCampaignIds, setJoinedCampaignIds] = useState<Set<string>>(new Set());
  const [approvedAccounts, setApprovedAccounts] = useState<any[]>([]);
  const [joinsByAccount, setJoinsByAccount] = useState<any[]>([]);
  const [showJoinModal, setShowJoinModal] = useState(false);
  const [joinTargetCampaign, setJoinTargetCampaign] = useState<any>(null);
  const [selectedAccount, setSelectedAccount] = useState("");
  const [joining, setJoining] = useState(false);

  const loadJoins = async () => {
    try {
      const res = await fetch("/api/campaign-accounts");
      const joins = await res.json();
      const arr = Array.isArray(joins) ? joins : [];
      setJoinsByAccount(arr);
      setJoinedCampaignIds(new Set(arr.map((j: any) => j.campaignId)));
    } catch {}
  };

  useEffect(() => {
    Promise.all([
      fetch("/api/campaigns").then((r) => r.json()),
      fetch("/api/campaigns/spend").then((r) => r.json()),
      fetch("/api/accounts/mine?status=APPROVED").then((r) => r.json()),
      fetch("/api/campaign-accounts").then((r) => r.json()),
    ])
      .then(([campaignData, spendData, accountsData, joinsData]) => {
        const arr = Array.isArray(campaignData) ? campaignData : [];
        setCampaigns(arr.filter((c: any) => c.status === "ACTIVE" || c.status === "PAUSED"));
        setClipsByCampaign(typeof spendData === "object" && spendData !== null ? spendData : {});
        setApprovedAccounts(Array.isArray(accountsData) ? accountsData : []);
        const joinsArr = Array.isArray(joinsData) ? joinsData : [];
        setJoinsByAccount(joinsArr);
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

  const openJoinModal = (e: React.MouseEvent, campaign: any) => {
    e.preventDefault();
    e.stopPropagation();
    if (approvedAccounts.length === 0) {
      toast.error("You need an approved account before joining campaigns.");
      return;
    }
    setJoinTargetCampaign(campaign);
    setSelectedAccount("");
    setShowJoinModal(true);
  };

  const handleJoin = async () => {
    if (!selectedAccount || !joinTargetCampaign) {
      toast.error("Please select an account.");
      return;
    }
    setJoining(true);
    try {
      const res = await fetch("/api/campaign-accounts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clipAccountId: selectedAccount, campaignId: joinTargetCampaign.id }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to join");
      toast.success(`Joined ${joinTargetCampaign.name} successfully!`);
      setShowJoinModal(false);
      setJoinTargetCampaign(null);
      setSelectedAccount("");
      await loadJoins();
    } catch (err: any) {
      toast.error(err.message || "Failed to join campaign.");
    }
    setJoining(false);
  };

  // Get accounts available for a specific campaign (not already joined)
  const getAvailableAccounts = (campaignId: string) => {
    const joinedAccountIds = new Set(
      joinsByAccount.filter((j: any) => j.campaignId === campaignId).map((j: any) => j.clipAccountId)
    );
    return approvedAccounts.filter((a: any) => !joinedAccountIds.has(a.id));
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
        <div className="grid gap-5 sm:grid-cols-2">
          {campaigns.map((campaign: any) => {
            const isPaused = campaign.status === "PAUSED";
            const spent = clipsByCampaign[campaign.id] || 0;
            const budget = campaign.budget || 0;
            const pct = budget > 0 ? Math.min((spent / budget) * 100, 100) : 0;
            const isJoined = joinedCampaignIds.has(campaign.id);

            return (
              <Link key={campaign.id} href={`/campaigns/${campaign.id}`}>
                <Card hover className={`h-full ${isPaused ? "opacity-70" : ""}`}>
                  {/* Top row: image + title + badge */}
                  <div className="flex items-start gap-4">
                    {campaign.imageUrl && (
                      <div className="h-16 w-16 flex-shrink-0 overflow-hidden rounded-xl border border-[var(--border-color)]">
                        <img src={campaign.imageUrl} alt="" className="h-full w-full object-cover" />
                      </div>
                    )}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <CardTitle>{campaign.name}</CardTitle>
                          <CardDescription>{campaign.platform?.replace(/,\s*/g, " · ")}</CardDescription>
                        </div>
                        <div className="flex items-center gap-2 flex-shrink-0">
                          <button
                            onClick={(e) => toggleFavorite(e, campaign.id)}
                            className="rounded-lg p-1 transition-colors cursor-pointer hover:bg-accent/10"
                          >
                            <Star className={`h-4 w-4 ${favorites.includes(campaign.id) ? "fill-accent text-accent" : "text-[var(--text-muted)]"}`} />
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Budget progress bar */}
                  {budget > 0 && (
                    <div className="mt-4">
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-xs font-medium text-[var(--text-primary)]">
                          {formatCurrency(spent)} spent of {formatCurrency(budget)}
                        </span>
                        <Badge variant={campaign.status.toLowerCase() as any}>{campaign.status}</Badge>
                      </div>
                      <div className="h-2.5 rounded-full bg-[var(--bg-input)] border border-[var(--border-subtle)]">
                        <div
                          className="h-full rounded-full bg-accent transition-all duration-500"
                          style={{ width: `${Math.max(pct, 1)}%` }}
                        />
                      </div>
                    </div>
                  )}
                  {!budget && (
                    <div className="mt-3">
                      <Badge variant={campaign.status.toLowerCase() as any}>{campaign.status}</Badge>
                    </div>
                  )}

                  {/* Key payout info */}
                  <div className="mt-3 grid grid-cols-3 gap-3">
                    {(campaign.clipperCpm ?? campaign.cpmRate) != null && (campaign.clipperCpm ?? campaign.cpmRate) > 0 && (
                      <div>
                        <p className="text-xs text-[var(--text-muted)]">CPM</p>
                        <p className="text-[15px] font-semibold text-[var(--text-primary)]">{formatCurrency(campaign.clipperCpm ?? campaign.cpmRate)}</p>
                      </div>
                    )}
                    {campaign.maxPayoutPerClip != null && campaign.maxPayoutPerClip > 0 && (
                      <div>
                        <p className="text-xs text-[var(--text-muted)]">Max / clip</p>
                        <p className="text-[15px] font-semibold text-[var(--text-primary)]">{formatCurrency(campaign.maxPayoutPerClip)}</p>
                      </div>
                    )}
                    {campaign.minViews != null && campaign.minViews > 0 && (
                      <div>
                        <p className="text-xs text-[var(--text-muted)]">Min views</p>
                        <p className="text-[15px] font-semibold text-[var(--text-primary)]">{formatNumber(campaign.minViews)}</p>
                      </div>
                    )}
                  </div>

                  {/* Join status / button — clipper only */}
                  {isClipper && (
                  <div className="mt-4 pt-3 border-t border-[var(--border-subtle)]">
                    {isJoined ? (
                      <div className="flex items-center gap-1.5">
                        <CheckCircle className="h-4 w-4 text-emerald-400" />
                        <span className="text-sm font-medium text-emerald-400">Joined</span>
                      </div>
                    ) : campaign.status === "ACTIVE" ? (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={(e) => openJoinModal(e, campaign)}
                        icon={<UserPlus className="h-3.5 w-3.5" />}
                      >
                        Join Campaign
                      </Button>
                    ) : (
                      <span className="text-xs text-[var(--text-muted)]">Campaign paused</span>
                    )}
                  </div>
                  )}
                </Card>
              </Link>
            );
          })}
        </div>
      )}

      {/* Join Modal */}
      <Modal open={showJoinModal} onClose={() => { setShowJoinModal(false); setJoinTargetCampaign(null); }} title="Join campaign">
        {joinTargetCampaign && (() => {
          const available = getAvailableAccounts(joinTargetCampaign.id);
          return available.length === 0 ? (
            <div className="py-6 text-center">
              <p className="text-[15px] text-[var(--text-secondary)]">
                {approvedAccounts.length === 0
                  ? "You need an approved account first."
                  : "All your approved accounts have already joined this campaign."}
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              <p className="text-[15px] text-[var(--text-secondary)]">
                Select an approved account to join <span className="font-medium text-[var(--text-primary)]">{joinTargetCampaign.name}</span>:
              </p>
              <Select
                id="joinAccount"
                label="Account"
                options={available.map((a: any) => ({
                  value: a.id,
                  label: `${a.username} (${a.platform})`,
                }))}
                placeholder="Select account"
                value={selectedAccount}
                onChange={(e) => setSelectedAccount(e.target.value)}
              />
              <div className="flex justify-end gap-3 pt-2">
                <Button variant="ghost" onClick={() => { setShowJoinModal(false); setJoinTargetCampaign(null); }}>Cancel</Button>
                <Button onClick={handleJoin} loading={joining} icon={<UserPlus className="h-4 w-4" />}>
                  Join campaign
                </Button>
              </div>
            </div>
          );
        })()}
      </Modal>
    </div>
  );
}
