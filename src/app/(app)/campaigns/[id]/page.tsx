"use client";

import { useEffect, useState, useMemo, useRef } from "react";
import { useParams, useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import type { SessionUser } from "@/lib/auth-types";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatCurrency, formatNumber } from "@/lib/utils";
import { CampaignImage } from "@/components/ui/campaign-image";
import {
  ArrowLeft, ExternalLink, UserPlus, CheckCircle, Music, LinkIcon, LogOut,
  FolderOpen, Play, DollarSign, Eye, Film, Target, ChevronDown, ChevronRight,
  PlusCircle, FileText, Hash, Type,
} from "lucide-react";
import { toast } from "@/lib/toast";
import Link from "next/link";

function isUrl(str: string): boolean {
  return /^https?:\/\//i.test(str.trim());
}

// Classify a URL into a resource type so we can pick the right icon + label.
type ResourceKind = "drive" | "tiktok" | "youtube" | "instagram" | "sound" | "link";

function classifyResource(url: string, explicitLabel?: string): { kind: ResourceKind; title: string } {
  const lower = url.toLowerCase();
  if (lower.includes("drive.google") || lower.includes("dropbox") || lower.includes("/folders/") || lower.includes("onedrive")) {
    return { kind: "drive", title: explicitLabel || "Content drive" };
  }
  if (lower.includes("tiktok.com")) return { kind: "tiktok", title: explicitLabel || "TikTok sound" };
  if (lower.includes("youtube.com") || lower.includes("youtu.be")) return { kind: "youtube", title: explicitLabel || "YouTube" };
  if (lower.includes("instagram.com") || lower.includes("instagr.am")) return { kind: "instagram", title: explicitLabel || "Instagram sound" };
  if (lower.includes("soundcloud") || lower.includes("spotify") || lower.includes("audio") || lower.includes("music")) {
    return { kind: "sound", title: explicitLabel || "Sound" };
  }
  return { kind: "link", title: explicitLabel || "Resource" };
}

function ResourceCard({ url, label }: { url: string; label?: string }) {
  const { kind, title } = classifyResource(url, label);
  const Icon =
    kind === "drive" ? FolderOpen :
    kind === "youtube" ? Play :
    kind === "tiktok" || kind === "instagram" || kind === "sound" ? Music :
    ExternalLink;
  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      className="group flex items-center gap-3 bg-[var(--bg-card-hover)] border border-[var(--border-color)] rounded-xl p-4 hover:border-accent/40 hover:bg-[var(--bg-input)] transition-colors"
    >
      <div className="flex-shrink-0 h-10 w-10 rounded-lg bg-accent/10 flex items-center justify-center">
        <Icon className="h-5 w-5 text-accent" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-accent">{title}</p>
        <p className="text-xs text-[var(--text-muted)] truncate">{url}</p>
      </div>
      <ExternalLink className="h-4 w-4 text-[var(--text-muted)] opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0" />
    </a>
  );
}

// Small stat card used in the 2x2 key-info grid.
function InfoCard({
  icon: Icon,
  label,
  value,
  sub,
  children,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value?: string;
  sub?: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="rounded-xl bg-[var(--bg-card-hover)] border border-[var(--border-color)] p-4">
      <div className="flex items-center gap-2 mb-2">
        <Icon className="h-4 w-4 text-accent" />
        <p className="text-[11px] font-semibold uppercase tracking-wider text-[var(--text-muted)]">{label}</p>
      </div>
      {value !== undefined && (
        <p className="text-lg font-bold text-[var(--text-primary)] leading-tight">{value}</p>
      )}
      {sub && <p className="text-xs text-[var(--text-muted)] mt-1">{sub}</p>}
      {children}
    </div>
  );
}

export default function CampaignDetailPage() {
  const { id } = useParams();
  const router = useRouter();
  const { data: session } = useSession();
  const userRole = (session?.user as SessionUser | undefined)?.role || "CLIPPER";
  const isClipper = userRole === "CLIPPER";

  const [campaign, setCampaign] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [approvedAccounts, setApprovedAccounts] = useState<any[]>([]);
  const [joinedAccounts, setJoinedAccounts] = useState<any[]>([]);
  const [myClips, setMyClips] = useState<any[]>([]);
  const [spendMap, setSpendMap] = useState<Record<string, number>>({});
  const [joining, setJoining] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const [requirementsOpen, setRequirementsOpen] = useState(true);
  const [confirmedRequirements, setConfirmedRequirements] = useState(false);
  const requirementsRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const fetches: Promise<any>[] = [
      fetch(`/api/campaigns/${id}`).then((r) => r.json()),
      fetch("/api/accounts/mine?status=APPROVED").then((r) => r.json()),
      fetch(`/api/campaign-accounts?campaignId=${id}`).then((r) => r.json()),
      fetch("/api/campaigns/spend").then((r) => r.json()).catch(() => ({})),
    ];
    // /api/clips/mine is CLIPPER-only; skip for admin/owner preview
    if (isClipper) {
      fetches.push(fetch(`/api/clips/mine?campaignIds=${id}`).then((r) => r.json()).catch(() => []));
    }

    Promise.all(fetches)
      .then((results) => {
        const [campaignData, accountsData, joinsData, spendData, mineData] = results;
        setCampaign(campaignData);
        setApprovedAccounts(Array.isArray(accountsData) ? accountsData : []);
        setJoinedAccounts(Array.isArray(joinsData) ? joinsData : []);
        setSpendMap(spendData && typeof spendData === "object" ? spendData : {});
        if (Array.isArray(mineData)) setMyClips(mineData);
      })
      .catch(() => router.push("/campaigns"))
      .finally(() => setLoading(false));
  }, [id, router, isClipper]);

  const handleQuickJoin = async () => {
    if (approvedAccounts.length === 0) {
      router.push("/accounts?message=add-account-first");
      return;
    }
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

  const handleLeave = async () => {
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
  };

  // Derive resources (URLs + non-URL example text) and cross-section memos before any early return
  // to keep hook order stable across renders.
  const { resourceEntries, exampleText } = useMemo(() => {
    const entries: { url: string; label?: string }[] = [];
    const textLines: string[] = [];
    if (campaign?.soundLink && isUrl(campaign.soundLink)) entries.push({ url: campaign.soundLink, label: "Sound" });
    if (campaign?.assetLink && isUrl(campaign.assetLink)) entries.push({ url: campaign.assetLink, label: "Asset" });
    if (campaign?.examples) {
      for (const raw of String(campaign.examples).split("\n")) {
        const line = raw.trim();
        if (!line) continue;
        if (isUrl(line)) entries.push({ url: line });
        else textLines.push(line);
      }
    }
    // Dedupe by URL
    const seen = new Set<string>();
    const deduped = entries.filter((e) => (seen.has(e.url) ? false : (seen.add(e.url), true)));
    return { resourceEntries: deduped, exampleText: textLines.join("\n") };
  }, [campaign]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-[var(--border-color)] border-t-accent" />
      </div>
    );
  }

  if (!campaign) return null;

  const platforms: string[] = campaign.platform ? campaign.platform.split(",").map((p: string) => p.trim()) : [];
  const cpm = campaign.clipperCpm ?? campaign.cpmRate ?? null;
  const budget: number | null = typeof campaign.budget === "number" ? campaign.budget : null;
  const spent = budget ? (spendMap[String(id)] ?? 0) : 0;
  const budgetPct = budget && budget > 0 ? Math.min((spent / budget) * 100, 100) : 0;
  const requirementLines: string[] = campaign.requirements
    ? String(campaign.requirements).split("\n").map((s: string) => s.trim()).filter(Boolean)
    : [];
  const approvedClipCount = myClips.filter((c) => c.status === "APPROVED").length;

  return (
    <div className="mx-auto max-w-3xl space-y-5 pb-8">
      <button
        onClick={() => router.back()}
        className="flex items-center gap-2 text-sm text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors cursor-pointer"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to campaigns
      </button>

      {/* ── 1. HEADER ─────────────────────────────────────────── */}
      <div className="flex items-start gap-4 sm:gap-5">
        <div className="h-16 w-16 sm:h-20 sm:w-20 flex-shrink-0 overflow-hidden rounded-2xl border border-[var(--border-color)]">
          <CampaignImage src={campaign.imageUrl} name={campaign.name} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-3">
            <h1 className="text-xl sm:text-2xl font-bold text-[var(--text-primary)] leading-tight truncate">{campaign.name}</h1>
            <Badge variant={campaign.status.toLowerCase() as any}>{campaign.status}</Badge>
          </div>
          {platforms.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {platforms.map((p) => (
                <span
                  key={p}
                  className="inline-flex items-center gap-1 rounded-md bg-accent/10 border border-accent/20 px-2 py-0.5 text-[11px] font-medium text-accent"
                >
                  <span className="inline-block h-1.5 w-1.5 rounded-full bg-accent" />
                  {p}
                </span>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Paused banner */}
      {campaign.status === "PAUSED" && (
        <div className="flex flex-wrap items-center gap-2 rounded-xl bg-amber-500/10 border border-amber-500/20 px-4 py-3">
          <span className="text-sm font-semibold text-amber-400">This campaign is paused — budget limit reached.</span>
          <span className="text-xs text-[var(--text-muted)]">Views are still being tracked but earnings are frozen.</span>
        </div>
      )}

      {/* Joined accounts indicator — clipper only */}
      {isClipper && joinedAccounts.length > 0 && (
        <Card>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)]">Your joined accounts</h2>
            <Button
              size="sm"
              variant="ghost"
              className="text-red-400 hover:text-red-300 hover:bg-red-500/5"
              loading={leaving}
              onClick={handleLeave}
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

      {/* ── 2. KEY INFO (2x2 grid) ───────────────────────────── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <InfoCard
          icon={DollarSign}
          label="CPM Rate"
          value={cpm ? formatCurrency(cpm) : "—"}
          sub="per 1,000 views"
        />
        <InfoCard
          icon={Eye}
          label="Min Views"
          value={campaign.minViews ? formatNumber(campaign.minViews) : "None"}
          sub={campaign.minViews ? "to qualify" : "No minimum"}
        />
        {budget != null && budget > 0 ? (
          <InfoCard icon={Target} label="Budget">
            <p className="text-lg font-bold text-[var(--text-primary)] leading-tight">
              {formatCurrency(spent)}
              <span className="text-sm font-normal text-[var(--text-muted)]"> of {formatCurrency(budget)}</span>
            </p>
            <div className="mt-2 h-1.5 rounded-full bg-[var(--bg-input)] overflow-hidden">
              <div className="h-full rounded-full bg-accent transition-all duration-500" style={{ width: `${budgetPct}%` }} />
            </div>
            <p className="text-xs text-[var(--text-muted)] mt-1">{budgetPct.toFixed(0)}% used</p>
          </InfoCard>
        ) : (
          <InfoCard icon={Target} label="Budget" value="Unlimited" sub="No cap set" />
        )}
        {isClipper ? (
          <InfoCard
            icon={Film}
            label="Your Clips"
            value={`${myClips.length}`}
            sub={`${approvedClipCount} approved`}
          />
        ) : (
          <InfoCard
            icon={Film}
            label="Max / day"
            value={campaign.maxClipsPerUserPerDay ? `${campaign.maxClipsPerUserPerDay}` : "—"}
            sub="clips per clipper"
          />
        )}
      </div>

      {/* ── 3. REQUIREMENTS (collapsible) ────────────────────── */}
      {requirementLines.length > 0 && (
        <div ref={requirementsRef} className="scroll-mt-24">
          <Card>
            <button
              onClick={() => setRequirementsOpen((o) => !o)}
              className="flex w-full items-center justify-between text-left cursor-pointer"
            >
              <div className="flex items-center gap-2">
                <FileText className="h-4 w-4 text-accent" />
                <h2 className="text-sm font-semibold text-[var(--text-primary)]">Campaign Requirements</h2>
              </div>
              {requirementsOpen ? (
                <ChevronDown className="h-4 w-4 text-[var(--text-muted)]" />
              ) : (
                <ChevronRight className="h-4 w-4 text-[var(--text-muted)]" />
              )}
            </button>
            {requirementsOpen && (
              <>
                <ul className="mt-4 space-y-2">
                  {requirementLines.map((req, i) => (
                    <li key={i} className="flex items-start gap-2.5">
                      <span className="mt-1.5 h-1.5 w-1.5 flex-shrink-0 rounded-full bg-accent" />
                      <span className="text-[15px] text-[var(--text-primary)]">{req}</span>
                    </li>
                  ))}
                </ul>
                {/* Confirmation gate — the sticky Join button below won't fire until this is checked. */}
                {isClipper && campaign.status === "ACTIVE" && joinedAccounts.length === 0 && (
                  <label className="mt-5 flex items-start gap-3 cursor-pointer rounded-xl border border-[var(--border-color)] bg-[var(--bg-card-hover)] p-3 hover:border-accent/30 transition-colors">
                    <input
                      type="checkbox"
                      checked={confirmedRequirements}
                      onChange={(e) => setConfirmedRequirements(e.target.checked)}
                      className="mt-0.5 h-4 w-4 flex-shrink-0 rounded border-[var(--border-color)] accent-accent cursor-pointer"
                    />
                    <span className="text-sm text-[var(--text-primary)] select-none">
                      I have read and understood the campaign requirements
                    </span>
                  </label>
                )}
              </>
            )}
          </Card>
        </div>
      )}

      {/* Caption & Hashtag rules */}
      {(campaign.captionRules || campaign.hashtagRules || campaign.bannedContent) && (
        <Card>
          <div className="flex items-center gap-2 mb-3">
            <Type className="h-4 w-4 text-accent" />
            <h2 className="text-sm font-semibold text-[var(--text-primary)]">Content Rules</h2>
          </div>
          <div className="space-y-4">
            {campaign.captionRules && (
              <div>
                <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)] mb-1.5">
                  <Type className="h-3 w-3" /> Caption
                </p>
                <p className="text-[15px] text-[var(--text-secondary)] whitespace-pre-wrap">{campaign.captionRules}</p>
              </div>
            )}
            {campaign.hashtagRules && (
              <div>
                <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)] mb-1.5">
                  <Hash className="h-3 w-3" /> Hashtags
                </p>
                <p className="text-[15px] text-[var(--text-secondary)] whitespace-pre-wrap">{campaign.hashtagRules}</p>
              </div>
            )}
            {campaign.bannedContent && (
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-red-400 mb-1.5">Do not use</p>
                <p className="text-[15px] text-[var(--text-secondary)] whitespace-pre-wrap">{campaign.bannedContent}</p>
              </div>
            )}
          </div>
        </Card>
      )}

      {/* Payout rules */}
      {campaign.payoutRule && (
        <Card>
          <div className="flex items-center gap-2 mb-3">
            <DollarSign className="h-4 w-4 text-accent" />
            <h2 className="text-sm font-semibold text-[var(--text-primary)]">Payout Rules</h2>
          </div>
          <p className="text-[15px] text-[var(--text-secondary)] whitespace-pre-wrap">{campaign.payoutRule}</p>
        </Card>
      )}

      {/* ── 4. CAMPAIGN RESOURCES ─────────────────────────────── */}
      <Card>
        <div className="flex items-center gap-2 mb-4">
          <LinkIcon className="h-4 w-4 text-accent" />
          <h2 className="text-sm font-semibold text-[var(--text-primary)]">Campaign Resources</h2>
        </div>
        {resourceEntries.length === 0 && !exampleText ? (
          <p className="text-sm text-[var(--text-muted)]">No resources provided.</p>
        ) : (
          <>
            {exampleText && (
              <p className="text-sm text-[var(--text-secondary)] whitespace-pre-wrap mb-4">{exampleText}</p>
            )}
            {resourceEntries.length > 0 && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {resourceEntries.map((r, i) => (
                  <ResourceCard key={`${r.url}-${i}`} url={r.url} label={r.label} />
                ))}
              </div>
            )}
          </>
        )}
      </Card>

      {/* ── 5. YOUR CLIPS (clipper only) ──────────────────────── */}
      {isClipper && (
        <Card>
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <Film className="h-4 w-4 text-accent" />
              <h2 className="text-sm font-semibold text-[var(--text-primary)]">Your Clips</h2>
              {myClips.length > 0 && (
                <span className="text-xs text-[var(--text-muted)]">({myClips.length})</span>
              )}
            </div>
          </div>
          {myClips.length === 0 ? (
            <div className="text-center py-8">
              <Film className="h-10 w-10 text-[var(--text-muted)] mx-auto mb-3 opacity-50" />
              <p className="text-sm text-[var(--text-muted)] mb-4">You haven't submitted any clips yet</p>
              {campaign.status === "ACTIVE" && (
                <Link href={`/clips?campaignId=${id}`}>
                  <Button size="sm" icon={<PlusCircle className="h-4 w-4" />}>
                    Submit a Clip
                  </Button>
                </Link>
              )}
            </div>
          ) : (
            <div className="space-y-2">
              {myClips.map((clip: any) => {
                const views = clip.stats?.[0]?.views ?? 0;
                return (
                  <div
                    key={clip.id}
                    className="flex items-center gap-3 rounded-xl border border-[var(--border-color)] bg-[var(--bg-card-hover)] px-3 py-2.5"
                  >
                    <a
                      href={clip.clipUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex-1 min-w-0 text-sm text-accent hover:underline truncate flex items-center gap-1.5"
                    >
                      <ExternalLink className="h-3.5 w-3.5 flex-shrink-0 opacity-70" />
                      <span className="truncate">{clip.clipUrl}</span>
                    </a>
                    <Badge variant={String(clip.status).toLowerCase() as any}>{clip.status}</Badge>
                    <div className="hidden sm:block text-right min-w-[90px]">
                      <p className="text-xs text-[var(--text-muted)]">{formatNumber(views)} views</p>
                      <p className="text-sm font-semibold text-accent tabular-nums">{formatCurrency(clip.earnings || 0)}</p>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </Card>
      )}

      {/* ── 6. STICKY CTA ──────────────────────────────────────── */}
      {isClipper && campaign.status === "ACTIVE" && (
        <div className="sticky bottom-4 z-10 flex flex-col-reverse sm:flex-row gap-3 pt-2">
          {joinedAccounts.length === 0 && (
            <Button
              onClick={() => {
                // Two-step gate: first press scrolls to requirements and asks for review;
                // second press (after checkbox ticked) actually joins.
                if (requirementLines.length > 0 && !confirmedRequirements) {
                  setRequirementsOpen(true);
                  requirementsRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
                  toast.error("Please review the requirements first");
                  return;
                }
                handleQuickJoin();
              }}
              loading={joining}
              variant="secondary"
              className="w-full sm:flex-1"
              icon={<UserPlus className="h-4 w-4" />}
            >
              Join campaign
            </Button>
          )}
          <Link href={`/clips?campaignId=${id}`} className="w-full sm:flex-1">
            <Button className="w-full" icon={<PlusCircle className="h-4 w-4" />}>
              Submit a Clip
            </Button>
          </Link>
        </div>
      )}
    </div>
  );
}
