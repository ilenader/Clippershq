"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { Modal } from "@/components/ui/modal";
import { formatCurrency, formatNumber } from "@/lib/utils";
import { CampaignImage } from "@/components/ui/campaign-image";
import { ArrowLeft, ExternalLink, UserPlus, CheckCircle, Music, LinkIcon, LogOut } from "lucide-react";
import { toast } from "@/lib/toast";
import Link from "next/link";

function isUrl(str: string): boolean {
  return /^https?:\/\//i.test(str.trim());
}

function RenderTextWithLinks({ text }: { text: string }) {
  const lines = text.split("\n");
  return (
    <div className="space-y-1">
      {lines.map((line, i) => {
        const trimmed = line.trim();
        if (!trimmed) return null;
        if (isUrl(trimmed)) {
          return (
            <a
              key={i}
              href={trimmed}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1.5 text-sm text-accent hover:underline"
            >
              <ExternalLink className="h-3.5 w-3.5 flex-shrink-0" />
              {trimmed}
            </a>
          );
        }
        return <p key={i} className="text-[15px] text-[var(--text-secondary)]">{trimmed}</p>;
      })}
    </div>
  );
}

export default function CampaignDetailPage() {
  const { id } = useParams();
  const router = useRouter();
  const { data: session } = useSession();
  const userRole = (session?.user as any)?.role || "CLIPPER";
  const isClipper = userRole === "CLIPPER";
  const [campaign, setCampaign] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [approvedAccounts, setApprovedAccounts] = useState<any[]>([]);
  const [joinedAccounts, setJoinedAccounts] = useState<any[]>([]);
  const [showJoinModal, setShowJoinModal] = useState(false);
  const [selectedAccount, setSelectedAccount] = useState("");
  const [joining, setJoining] = useState(false);
  const [leaving, setLeaving] = useState(false);

  useEffect(() => {
    Promise.all([
      fetch(`/api/campaigns/${id}`).then((r) => r.json()),
      fetch("/api/accounts/mine?status=APPROVED").then((r) => r.json()),
      fetch(`/api/campaign-accounts?campaignId=${id}`).then((r) => r.json()),
    ])
      .then(([campaignData, accountsData, joinsData]) => {
        setCampaign(campaignData);
        setApprovedAccounts(Array.isArray(accountsData) ? accountsData : []);
        setJoinedAccounts(Array.isArray(joinsData) ? joinsData : []);
      })
      .catch(() => router.push("/campaigns"))
      .finally(() => setLoading(false));
  }, [id, router]);

  const handleQuickJoin = async () => {
    if (approvedAccounts.length === 0) {
      router.push("/accounts?message=add-account-first");
      return;
    }
    // Find first approved account matching campaign platforms
    const campaignPlatforms = campaign?.platform ? campaign.platform.split(",").map((p: string) => p.trim().toLowerCase()) : [];
    const matchingAccount = approvedAccounts.find((a: any) => campaignPlatforms.includes(a.platform.toLowerCase()));
    if (!matchingAccount) {
      toast.error(`You need a verified ${campaign?.platform || ""} account to join this campaign.`);
      return;
    }
    setJoining(true);
    try {
      const res = await fetch("/api/campaign-accounts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clipAccountId: matchingAccount.id, campaignId: id }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to join");
      toast.success("Joined campaign!");
      const joinsRes = await fetch(`/api/campaign-accounts?campaignId=${id}`);
      const joinsData = await joinsRes.json();
      setJoinedAccounts(Array.isArray(joinsData) ? joinsData : []);
    } catch (err: any) {
      toast.error(err.message || "Failed to join campaign.");
    }
    setJoining(false);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-[var(--border-color)] border-t-accent" />
      </div>
    );
  }

  if (!campaign) return null;

  const platforms = campaign.platform ? campaign.platform.split(",").map((p: string) => p.trim()) : [];
  const joinedIds = new Set(joinedAccounts.map((j: any) => j.clipAccountId));
  const availableAccounts = approvedAccounts.filter((a: any) => !joinedIds.has(a.id));

  const requirementLines = campaign.requirements
    ? campaign.requirements.split("\n").filter((r: string) => r.trim())
    : [];

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <button
        onClick={() => router.back()}
        className="flex items-center gap-2 text-sm text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors cursor-pointer"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to campaigns
      </button>

      <div className="flex items-start gap-5">
        <div className="h-20 w-20 flex-shrink-0 overflow-hidden rounded-2xl border border-[var(--border-color)]">
          <CampaignImage src={campaign.imageUrl} name={campaign.name} />
        </div>
        <div className="flex-1">
          <div className="flex items-start justify-between">
            <div>
              <h1 className="text-2xl font-bold text-[var(--text-primary)]">{campaign.name}</h1>
              <p className="text-[15px] text-[var(--text-secondary)]">{platforms.join(" · ")}</p>
            </div>
            <Badge variant={campaign.status.toLowerCase() as any}>{campaign.status}</Badge>
          </div>
        </div>
      </div>

      {/* Paused banner */}
      {campaign.status === "PAUSED" && (
        <div className="flex items-center gap-2 rounded-xl bg-amber-500/10 border border-amber-500/20 px-4 py-3">
          <span className="text-sm font-semibold text-amber-400">This campaign is paused — budget limit reached.</span>
          <span className="text-xs text-[var(--text-muted)]">Views are still being tracked but earnings are frozen.</span>
        </div>
      )}

      {/* Joined Accounts — clipper only */}
      {isClipper && joinedAccounts.length > 0 && (
        <Card>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)]">Your joined accounts</h2>
            <Button
              size="sm"
              variant="ghost"
              className="text-red-400 hover:text-red-300 hover:bg-red-500/5"
              loading={leaving}
              onClick={async () => {
                if (!confirm("Are you sure you want to leave this campaign? You'll stop earning from it.")) return;
                setLeaving(true);
                try {
                  for (const join of joinedAccounts) {
                    await fetch("/api/campaign-accounts", {
                      method: "DELETE",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({ clipAccountId: join.clipAccountId, campaignId: id }),
                    });
                  }
                  toast.success("Left campaign");
                  setJoinedAccounts([]);
                } catch { toast.error("Failed to leave campaign"); }
                setLeaving(false);
              }}
              icon={<LogOut className="h-3.5 w-3.5" />}
            >
              Leave Campaign
            </Button>
          </div>
          <div className="flex flex-wrap gap-2">
            {joinedAccounts.map((join: any) => {
              const acct = approvedAccounts.find((a: any) => a.id === join.clipAccountId);
              return (
                <div key={join.id || join.clipAccountId} className="flex items-center gap-1.5 rounded-xl border border-emerald-500/20 bg-emerald-500/5 px-3 py-2">
                  <CheckCircle className="h-3.5 w-3.5 text-emerald-400" />
                  <span className="text-sm font-medium text-emerald-400">
                    {acct?.username || join.clipAccount?.username || "Account"} ({acct?.platform || join.clipAccount?.platform || ""})
                  </span>
                </div>
              );
            })}
          </div>
        </Card>
      )}

      {/* Key Info */}
      <Card>
        <div className="grid gap-5 sm:grid-cols-2">
          {[
            { label: "Platforms", value: platforms.join(", ") || "N/A" },
            { label: "CPM rate", value: (campaign.clipperCpm ?? campaign.cpmRate) ? formatCurrency(campaign.clipperCpm ?? campaign.cpmRate) : "-" },
            { label: "Min views", value: campaign.minViews ? formatNumber(campaign.minViews) : "-" },
            { label: "Max payout / clip", value: campaign.maxPayoutPerClip ? formatCurrency(campaign.maxPayoutPerClip) : "-" },
            { label: "Start date", value: campaign.startDate ? new Date(campaign.startDate).toLocaleDateString() : "-" },
          ].map((item) => (
            <div key={item.label}>
              <p className="text-xs font-medium uppercase tracking-wider text-[var(--text-muted)]">{item.label}</p>
              <p className="mt-1 text-[15px] font-medium text-[var(--text-primary)]">{item.value}</p>
            </div>
          ))}
        </div>
      </Card>

      {/* Requirements — prominent */}
      {requirementLines.length > 0 && (
        <Card>
          <h2 className="mb-3 text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)]">Requirements</h2>
          <ul className="space-y-2">
            {requirementLines.map((req: string, i: number) => (
              <li key={i} className="flex items-start gap-2.5">
                <span className="mt-1.5 h-1.5 w-1.5 flex-shrink-0 rounded-full bg-accent" />
                <span className="text-[15px] text-[var(--text-primary)]">{req}</span>
              </li>
            ))}
          </ul>
        </Card>
      )}

      {/* Caption & Hashtag Rules */}
      {(campaign.captionRules || campaign.hashtagRules) && (
        <Card>
          <h2 className="mb-3 text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)]">Content rules</h2>
          {campaign.captionRules && (
            <div className="mb-4">
              <p className="text-sm font-medium text-[var(--text-muted)] mb-1">Caption</p>
              <p className="text-[15px] text-[var(--text-secondary)] whitespace-pre-wrap">{campaign.captionRules}</p>
            </div>
          )}
          {campaign.hashtagRules && (
            <div>
              <p className="text-sm font-medium text-[var(--text-muted)] mb-1">Hashtags</p>
              <p className="text-[15px] text-[var(--text-secondary)] whitespace-pre-wrap">{campaign.hashtagRules}</p>
            </div>
          )}
        </Card>
      )}

      {/* Examples & Assets */}
      {(campaign.examples || campaign.soundLink || campaign.assetLink) && (
        <Card>
          <h2 className="mb-3 text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)]">Examples & assets</h2>
          {campaign.examples && (
            <div className="mb-4">
              <RenderTextWithLinks text={campaign.examples} />
            </div>
          )}
          <div className="flex flex-wrap gap-3">
            {campaign.soundLink && (
              <a href={campaign.soundLink} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-2 rounded-xl border border-accent/20 bg-accent/5 px-4 py-2 text-sm font-medium text-accent hover:bg-accent/10 transition-all">
                <Music className="h-4 w-4" />
                Sound link
              </a>
            )}
            {campaign.assetLink && (
              <a href={campaign.assetLink} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-2 rounded-xl border border-accent/20 bg-accent/5 px-4 py-2 text-sm font-medium text-accent hover:bg-accent/10 transition-all">
                <LinkIcon className="h-4 w-4" />
                Asset link
              </a>
            )}
          </div>
        </Card>
      )}

      {/* Payout Rules */}
      {campaign.payoutRule && (
        <Card>
          <h2 className="mb-3 text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)]">Payout rules</h2>
          <p className="text-[15px] text-[var(--text-secondary)] whitespace-pre-wrap">{campaign.payoutRule}</p>
        </Card>
      )}

      {/* CTAs — clipper only */}
      {isClipper && (
        <div className="flex gap-3">
          {campaign.status === "ACTIVE" && (
            joinedAccounts.length > 0 ? (
              <div className="flex items-center gap-1.5 rounded-xl border border-emerald-500/20 bg-emerald-500/5 px-5 py-2.5">
                <CheckCircle className="h-4 w-4 text-emerald-400" />
                <span className="text-sm font-medium text-emerald-400">Joined</span>
              </div>
            ) : (
              <Button onClick={handleQuickJoin} loading={joining} icon={<UserPlus className="h-4 w-4" />}>
                Join campaign
              </Button>
            )
          )}
          <Link href={`/clips?campaignId=${id}`}>
            <Button variant="secondary">Submit a clip</Button>
          </Link>
        </div>
      )}

      {/* Join modal removed — auto-join on click */}
    </div>
  );
}
