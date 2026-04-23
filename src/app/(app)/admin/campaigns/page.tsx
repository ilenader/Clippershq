"use client";

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import type { SessionUser } from "@/lib/auth-types";
import { Card, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Modal } from "@/components/ui/modal";
import { EmptyState } from "@/components/ui/empty-state";
import { MultiDropdown } from "@/components/ui/dropdown-filter";
import { ImageUpload } from "@/components/ui/image-upload";
import { CampaignImageSlots } from "@/components/ui/CampaignImageSlots";
import { formatCurrency, formatNumber, formatDate } from "@/lib/utils";
import { CampaignImage } from "@/components/ui/campaign-image";
import { Plus, Megaphone, Mail, Pause, Play, Pencil, Trash2, Users, CheckCircle, XCircle, Clock, FileEdit, ChevronDown, Download, Archive, RotateCcw } from "lucide-react";
import { formatRelative } from "@/lib/utils";
import { toast } from "@/lib/toast";

const platformList = [
  { value: "TikTok", label: "TikTok" },
  { value: "Instagram", label: "Instagram" },
  { value: "YouTube", label: "YouTube" },
];

const statusFilterOptions = [
  { value: "ACTIVE", label: "Active" },
  { value: "PAUSED", label: "Paused" },
  { value: "DRAFT", label: "In Review" },
  { value: "PAST", label: "Past" },
];

const defaultForm = {
  name: "", platforms: [] as string[],
  pricingModel: "AGENCY_FEE",
  clipperCpm: "", ownerCpm: "", agencyFee: "", budget: "",
  payoutRule: "", minViews: "", maxPayoutPerClip: "",
  maxClipsPerUserPerDay: "3",
  requirementsList: [""] as string[],
  examples: "", soundLink: "", assetLink: "", imageUrl: "",
  cardImageUrl: "", bannerImageUrl: "", communityAvatarUrl: "",
  captionRules: "", hashtagRules: "",
  aiKnowledge: "",
  startDate: "",
  targetAudience: "",
  targetCountriesInput: "",
  accountCountriesInput: "",
  ownerUserId: "",
  announceOnDiscord: false,
};

export default function AdminCampaignsPage() {
  const { data: session } = useSession();
  const userRole = (session?.user as SessionUser)?.role || "CLIPPER";
  const userId = session?.user?.id;
  const isOwner = userRole === "OWNER";

  const [campaigns, setCampaigns] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [exportingId, setExportingId] = useState<string | null>(null);
  const [showModal, setShowModal] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [form, setForm] = useState(defaultForm);
  const [filterStatuses, setFilterStatuses] = useState<string[]>([]);
  const [spendByCampaign, setSpendByCampaign] = useState<Record<string, number>>({});
  const [memberStats, setMemberStats] = useState<Record<string, { clippers: number; accounts: number }>>({});
  const [pendingEdits, setPendingEdits] = useState<any[]>([]);
  const [reviewingEdit, setReviewingEdit] = useState<any | null>(null);
  const [historyTarget, setHistoryTarget] = useState<string | null>(null);
  const [historyEvents, setHistoryEvents] = useState<any[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [ownerUsers, setOwnerUsers] = useState<any[]>([]);

  const load = () => {
    const fetches: Promise<any>[] = [
      fetch("/api/campaigns?scope=manage&includePast=true").then((r) => r.json()),
      fetch("/api/campaigns/spend").then((r) => r.json()),
      fetch("/api/campaigns/members").then((r) => r.json()),
    ];
    // Owner also fetches pending edits
    if (isOwner) {
      fetches.push(fetch("/api/admin/pending-edits").then((r) => r.json()));
    }
    Promise.all(fetches)
      .then(([campaignData, spendData, membersData, editsData]) => {
        setCampaigns(Array.isArray(campaignData) ? campaignData : []);
        setSpendByCampaign(typeof spendData === "object" && spendData !== null ? spendData : {});
        setMemberStats(typeof membersData === "object" && membersData !== null ? membersData : {});
        if (editsData) {
          const pending = Array.isArray(editsData) ? editsData.filter((e: any) => e.status === "PENDING") : [];
          setPendingEdits(pending);
        }
      })
      .catch(() => setCampaigns([]))
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  useEffect(() => {
    if (isOwner) {
      fetch("/api/admin/users?role=OWNER,ADMIN")
        .then((r) => r.json())
        .then((data) => setOwnerUsers(Array.isArray(data) ? data : []))
        .catch(() => {});
    }
  }, [isOwner]);

  const filteredCampaigns = filterStatuses.length > 0
    ? campaigns.filter((c: any) => filterStatuses.includes(c.status))
    : campaigns;

  // All campaigns in the admin's list are manageable — the API already filters by access
  // (creator, direct CampaignAdmin assignment, or team membership)
  const canManageCampaign = (_c: any) => true;

  // Draft persistence
  const DRAFT_KEY = "clippers_hq_campaign_draft";
  const saveDraft = (f: typeof defaultForm) => {
    try { localStorage.setItem(DRAFT_KEY, JSON.stringify(f)); } catch {}
  };
  const loadDraft = (): typeof defaultForm | null => {
    try { const raw = localStorage.getItem(DRAFT_KEY); return raw ? JSON.parse(raw) : null; } catch { return null; }
  };
  const clearDraft = () => {
    try { localStorage.removeItem(DRAFT_KEY); } catch {}
  };

  const openCreate = () => {
    setEditingId(null);
    const draft = loadDraft();
    setForm(draft || defaultForm);
    setShowModal(true);
  };

  const openEdit = (c: any) => {
    setEditingId(c.id);
    const reqs = c.requirements ? c.requirements.split("\n").filter((r: string) => r.trim()) : [""];
    setForm({
      name: c.name || "",
      platforms: c.platform ? c.platform.split(",").map((p: string) => p.trim()) : [],
      pricingModel: c.pricingModel || "AGENCY_FEE",
      clipperCpm: (c.clipperCpm ?? c.cpmRate ?? "")?.toString() || "",
      ownerCpm: c.ownerCpm?.toString() || "",
      agencyFee: c.agencyFee?.toString() || "",
      budget: c.budget?.toString() || "",
      payoutRule: c.payoutRule || "", minViews: c.minViews?.toString() || "",
      maxPayoutPerClip: c.maxPayoutPerClip?.toString() || "",
      maxClipsPerUserPerDay: c.maxClipsPerUserPerDay?.toString() || "3",
      requirementsList: reqs.length > 0 ? reqs : [""],
      examples: c.examples || "", soundLink: c.soundLink || "", assetLink: c.assetLink || "",
      imageUrl: c.imageUrl || "",
      cardImageUrl: c.cardImageUrl || "",
      bannerImageUrl: c.bannerImageUrl || "",
      communityAvatarUrl: c.communityAvatarUrl || "",
      captionRules: c.captionRules || "", hashtagRules: c.hashtagRules || "",
      aiKnowledge: c.aiKnowledge || "",
      startDate: c.startDate ? new Date(c.startDate).toISOString().split("T")[0] : "",
      targetAudience: c.targetAudience || "",
      targetCountriesInput: (() => { try { return JSON.parse(c.targetCountries || "[]").join(", "); } catch { return ""; } })(),
      accountCountriesInput: (() => { try { const obj = JSON.parse(c.accountCountries || "{}"); return Object.entries(obj).map(([k, v]) => `${k}: ${v}%`).join("\n"); } catch { return ""; } })(),
      ownerUserId: c.ownerUserId || "",
      announceOnDiscord: !!c.announceOnDiscord,
    });
    setShowModal(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name || form.platforms.length === 0) {
      toast.error("Name and at least one platform are required.");
      return;
    }
    const numericFields = [
      { name: "budget", val: form.budget },
      { name: "clipperCpm", val: form.clipperCpm },
      { name: "ownerCpm", val: form.ownerCpm },
      { name: "agencyFee", val: form.agencyFee },
    ];
    for (const f of numericFields) {
      if (f.val !== undefined && f.val !== null && f.val !== "" && (isNaN(Number(f.val)) || Number(f.val) <= 0)) {
        toast.error("Please enter valid positive numbers for pricing fields.");
        return;
      }
    }
    setSubmitting(true);
    try {
      const requirements = form.requirementsList.filter((r) => r.trim()).join("\n");
      const payload: Record<string, any> = {
        name: form.name, platform: form.platforms.join(", "),
        pricingModel: form.pricingModel, clipperCpm: form.clipperCpm,
        ownerCpm: form.ownerCpm, agencyFee: form.agencyFee, budget: form.budget,
        payoutRule: form.payoutRule,
        minViews: form.minViews, maxPayoutPerClip: form.maxPayoutPerClip,
        maxClipsPerUserPerDay: form.maxClipsPerUserPerDay, requirements,
        examples: form.examples, soundLink: form.soundLink, assetLink: form.assetLink,
        imageUrl: form.imageUrl,
        cardImageUrl: form.cardImageUrl || null,
        bannerImageUrl: form.bannerImageUrl || null,
        communityAvatarUrl: form.communityAvatarUrl || null,
        captionRules: form.captionRules, hashtagRules: form.hashtagRules,
        aiKnowledge: form.aiKnowledge,
        startDate: editingId ? form.startDate : new Date().toISOString().split("T")[0],
        targetAudience: form.targetAudience || null,
        targetCountries: form.targetAudience === "custom"
          ? JSON.stringify(form.targetCountriesInput.split(",").map((c) => c.trim()).filter(Boolean))
          : null,
        accountCountries: form.accountCountriesInput.trim()
          ? JSON.stringify(
              Object.fromEntries(
                form.accountCountriesInput.split("\n")
                  .map((line) => {
                    const [country, pct] = line.split(":").map((s) => s.trim().replace("%", ""));
                    return [country, parseInt(pct) || 0];
                  })
                  .filter(([c]) => c)
              )
            )
          : null,
        ownerUserId: form.ownerUserId || null,
        announceOnDiscord: !!form.announceOnDiscord,
      };

      if (editingId) {
        if (!isOwner) payload.status = undefined; // admin can't change status
        const res = await fetch(`/api/campaigns/${editingId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Failed to update campaign");
        // Check if this was a pending edit (admin flow)
        if (data.pendingEdit) {
          toast.success("Changes submitted for owner review.");
        } else {
          toast.success("Campaign updated.");
        }
      } else {
        payload.status = "ACTIVE";
        const res = await fetch("/api/campaigns", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Failed to create campaign");
        toast.success(isOwner ? "Campaign created." : "Campaign submitted for owner review.");
      }

      setShowModal(false);
      setForm(defaultForm);
      setEditingId(null);
      clearDraft();
      load();
    } catch (err: any) {
      toast.error(err.message || "Failed.");
    }
    setSubmitting(false);
  };

  useEffect(() => {
    if (!editingId && showModal) saveDraft(form);
  }, [form, editingId, showModal]);

  const toggleStatus = async (c: any) => {
    const newStatus = c.status === "ACTIVE" ? "PAUSED" : "ACTIVE";
    try {
      const res = await fetch(`/api/campaigns/${c.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: newStatus }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed");
      toast.success(`Campaign ${newStatus === "ACTIVE" ? "resumed" : "paused"}.`);
      load();
    } catch (err: any) {
      toast.error(err.message || "Failed to update status.");
    }
  };

  // OWNER-only. Flipping to PAST hides the campaign from clippers/admins, stops
  // tracking, and blocks new clip submissions. Reactivate returns the campaign
  // to ACTIVE so everything resumes. Backed by a PATCH status on the detail
  // route, which already gates the PAST transitions behind OWNER role.
  const flipPastStatus = async (c: any) => {
    const goingToPast = c.status !== "PAST";
    const newStatus = goingToPast ? "PAST" : "ACTIVE";
    try {
      const res = await fetch(`/api/campaigns/${c.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: newStatus }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed");
      toast.success(goingToPast ? "Campaign moved to Past." : "Campaign reactivated.");
      load();
    } catch (err: any) {
      toast.error(err.message || "Failed to update status.");
    }
  };

  const [deleteTarget, setDeleteTarget] = useState<any | null>(null);
  const [deleteConfirmText, setDeleteConfirmText] = useState("");
  const [deleting, setDeleting] = useState(false);

  const [notifyTarget, setNotifyTarget] = useState<any | null>(null);
  const [notifyConfirmText, setNotifyConfirmText] = useState("");
  const [notifying, setNotifying] = useState(false);

  const sendNotification = async () => {
    if (!notifyTarget) return;
    setNotifying(true);
    try {
      const res = await fetch(`/api/campaigns/${notifyTarget.id}/notify`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed");
      toast.success(`Notification sent to ${data.sent} clippers.`);
      setNotifyTarget(null);
      setNotifyConfirmText("");
    } catch (err: any) {
      toast.error(err.message || "Failed to send notifications.");
    }
    setNotifying(false);
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      const res = await fetch(`/api/campaigns/${deleteTarget.id}`, { method: "DELETE" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed");
      toast.success("Campaign archived.");
      setDeleteTarget(null);
      setDeleteConfirmText("");
      load();
    } catch (err: any) {
      toast.error(err.message || "Failed to archive.");
    }
    setDeleting(false);
  };

  // ── Owner: approve/reject DRAFT campaign ──
  const reviewCampaign = async (campaignId: string, approve: boolean) => {
    try {
      const res = await fetch(`/api/campaigns/${campaignId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: approve ? "ACTIVE" : "COMPLETED" }),
      });
      if (!res.ok) throw new Error("Failed");
      toast.success(approve ? "Campaign approved and now live." : "Campaign rejected.");
      load();
    } catch (err: any) {
      toast.error(err.message || "Failed to review campaign.");
    }
  };

  // ── Owner: approve/reject pending edit ──
  const reviewEdit = async (editId: string, approve: boolean) => {
    try {
      const res = await fetch(`/api/admin/pending-edits/${editId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: approve ? "APPROVED" : "REJECTED" }),
      });
      if (!res.ok) throw new Error("Failed");
      toast.success(approve ? "Edit approved and applied." : "Edit rejected.");
      setReviewingEdit(null);
      load();
    } catch (err: any) {
      toast.error(err.message || "Failed to review edit.");
    }
  };

  const exportClientReport = async (campaignId: string) => {
    setExportingId(campaignId);
    try {
      const res = await fetch(`/api/admin/export?view=client&type=clips&campaignId=${campaignId}`);
      if (!res.ok) { const data = await res.json(); throw new Error(data.error || "Export failed"); }
      const blob = await res.blob();
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = `client-report-${new Date().toISOString().split("T")[0]}.xlsx`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(a.href);
      toast.success("Client report downloaded!");
    } catch (err: any) {
      toast.error(err.message || "Export failed");
    }
    setExportingId(null);
  };

  const updateField = (field: string, value: string) => setForm({ ...form, [field]: value });
  const addRequirement = () => setForm({ ...form, requirementsList: [...form.requirementsList, ""] });
  const removeRequirement = (idx: number) => {
    const updated = form.requirementsList.filter((_, i) => i !== idx);
    setForm({ ...form, requirementsList: updated.length === 0 ? [""] : updated });
  };
  const updateRequirement = (idx: number, value: string) => {
    const updated = [...form.requirementsList];
    updated[idx] = value;
    setForm({ ...form, requirementsList: updated });
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-[var(--text-primary)]">Campaign Manager</h1>
          <p className="text-[15px] text-[var(--text-secondary)]">
            {isOwner ? "Create and manage all campaigns." : "Manage your campaigns."}
          </p>
        </div>
        <Button onClick={openCreate} icon={<Plus className="h-4 w-4" />}>New Campaign</Button>
      </div>

      <MultiDropdown label="Status" options={statusFilterOptions} values={filterStatuses} onChange={setFilterStatuses} allLabel="All statuses" />

      {/* ── Owner Review Section: Pending Campaigns + Pending Edits ── */}
      {isOwner && !loading && (pendingEdits.length > 0 || filteredCampaigns.some((c: any) => c.status === "DRAFT")) && (
        <div className="space-y-4">
          <h2 className="text-lg font-semibold text-[var(--text-primary)] flex items-center gap-2">
            <Clock className="h-5 w-5 text-amber-400" />
            Pending Review
          </h2>

          {/* Draft campaigns awaiting approval */}
          {filteredCampaigns.filter((c: any) => c.status === "DRAFT").map((c: any) => (
            <Card key={`review-${c.id}`} className="border-amber-500/20">
              <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3 sm:gap-4">
                <div className="flex items-start gap-3">
                  <div className="h-12 w-12 flex-shrink-0 overflow-hidden rounded-xl border border-[var(--border-color)]">
                    <CampaignImage src={c.imageUrl} name={c.name} />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-[var(--text-primary)]">{c.name}</span>
                      <Badge variant="pending">In Review</Badge>
                    </div>
                    <p className="text-xs text-[var(--text-muted)] mt-0.5">{c.platform?.replace(/,\s*/g, " · ")}</p>
                    <p className="text-xs text-[var(--text-muted)]">New campaign submitted by admin · {formatDate(c.createdAt)}</p>
                  </div>
                </div>
                <div className="flex gap-2 flex-shrink-0 flex-wrap">
                  <Button size="sm" onClick={() => openEdit(c)} variant="outline" icon={<Pencil className="h-3 w-3" />}>View</Button>
                  <Button size="sm" onClick={() => reviewCampaign(c.id, true)} icon={<CheckCircle className="h-3 w-3" />}>Approve</Button>
                  <Button size="sm" variant="danger" onClick={() => reviewCampaign(c.id, false)} icon={<XCircle className="h-3 w-3" />}>Reject</Button>
                </div>
              </div>
            </Card>
          ))}

          {/* Pending edits awaiting approval */}
          {pendingEdits.map((edit: any) => {
            let changes: Record<string, any> = {};
            try { changes = JSON.parse(edit.changes); } catch {}
            const changedFields = Object.keys(changes);
            return (
              <Card key={`edit-${edit.id}`} className="border-blue-500/20">
                <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3 sm:gap-4">
                  <div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <FileEdit className="h-4 w-4 text-blue-400" />
                      <span className="text-sm font-medium text-[var(--text-primary)]">{edit.campaign?.name || "Campaign"}</span>
                      <Badge variant="pending">Edit Request</Badge>
                    </div>
                    <p className="text-xs text-[var(--text-muted)] mt-0.5">
                      By {edit.requestedBy?.username || "admin"} · {changedFields.length} field{changedFields.length !== 1 ? "s" : ""} changed
                    </p>
                    <div className="mt-2 flex flex-wrap gap-1">
                      {changedFields.slice(0, 5).map((f) => (
                        <span key={f} className="rounded-md bg-blue-500/10 px-2 py-0.5 text-[11px] text-blue-400">{f}</span>
                      ))}
                      {changedFields.length > 5 && <span className="text-[11px] text-[var(--text-muted)]">+{changedFields.length - 5} more</span>}
                    </div>
                  </div>
                  <div className="flex gap-2 flex-shrink-0 flex-wrap">
                    <Button size="sm" variant="outline" onClick={() => setReviewingEdit(edit)} icon={<Pencil className="h-3 w-3" />}>View diff</Button>
                    <Button size="sm" onClick={() => reviewEdit(edit.id, true)} icon={<CheckCircle className="h-3 w-3" />}>Approve</Button>
                    <Button size="sm" variant="danger" onClick={() => reviewEdit(edit.id, false)} icon={<XCircle className="h-3 w-3" />}>Reject</Button>
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-[var(--border-color)] border-t-accent" />
        </div>
      ) : filteredCampaigns.length === 0 ? (
        <EmptyState icon={<Megaphone className="h-10 w-10" />} title="No campaigns" description="Create your first campaign."
          action={<Button onClick={openCreate} icon={<Plus className="h-4 w-4" />}>New Campaign</Button>} />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {filteredCampaigns.map((c: any) => {
            const canManage = isOwner || canManageCampaign(c);
            return (
              <Card key={c.id} className="overflow-hidden">
                <div className="flex items-start gap-3 sm:gap-4">
                  <div className="h-12 w-12 sm:h-16 sm:w-16 flex-shrink-0 overflow-hidden rounded-xl border border-[var(--border-color)]">
                    <CampaignImage src={c.imageUrl} name={c.name} />
                  </div>
                  <div className="flex-1 min-w-0 overflow-hidden">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <CardTitle className="truncate">{c.name}</CardTitle>
                        <CardDescription className="truncate">{c.platform?.replace(/,\s*/g, " · ")}</CardDescription>
                      </div>
                      <Badge variant={c.status.toLowerCase() as any} className="flex-shrink-0">{c.status}</Badge>
                    </div>
                  </div>
                </div>
                {c.budget != null && c.budget > 0 && (() => {
                  const spent = spendByCampaign[c.id] || 0;
                  const pct = Math.min((spent / c.budget) * 100, 100);
                  return (
                    <div className="mt-3">
                      <div className="flex justify-between text-xs mb-1.5">
                        <span className="font-medium text-[var(--text-primary)]">{formatCurrency(spent)} spent of {formatCurrency(c.budget)}</span>
                      </div>
                      <div className="h-2.5 rounded-full bg-[var(--bg-input)] border border-[var(--border-subtle)]">
                        <div className="h-full rounded-full bg-accent transition-all duration-500" style={{ width: `${Math.max(pct, 1)}%` }} />
                      </div>
                    </div>
                  );
                })()}
                <div className="mt-3 flex flex-wrap gap-x-3 gap-y-1 text-xs sm:text-sm text-[var(--text-muted)]">
                  {(c.clipperCpm ?? c.cpmRate) != null && <span>CPM: {formatCurrency(c.clipperCpm ?? c.cpmRate)}</span>}
                  {c.budget != null && <span>Budget: {formatCurrency(c.budget)}</span>}
                  {c.minViews != null && <span>Min: {formatNumber(c.minViews)}</span>}
                  <span>{formatDate(c.createdAt)}</span>
                </div>
                {memberStats[c.id] && (
                  <div className="mt-2 flex items-center gap-3 text-sm">
                    <span className="flex items-center gap-1 text-[var(--text-secondary)]">
                      <Users className="h-3.5 w-3.5" />
                      {memberStats[c.id].clippers} clipper{memberStats[c.id].clippers !== 1 ? "s" : ""}
                    </span>
                    <span className="text-[var(--text-muted)]">
                      {memberStats[c.id].accounts} account{memberStats[c.id].accounts !== 1 ? "s" : ""}
                    </span>
                  </div>
                )}
                {/* Actions — only show for campaigns user can manage */}
                {canManage && (
                  <div className="mt-4 flex gap-1.5 sm:gap-2 flex-wrap">
                    <Button size="sm" variant="outline" onClick={() => openEdit(c)} icon={<Pencil className="h-3 w-3" />}>
                      {isOwner ? "Edit" : "Request edit"}
                    </Button>
                    {/* OWNER: approve/reject DRAFT campaigns */}
                    {isOwner && c.status === "DRAFT" && (
                      <>
                        <Button size="sm" onClick={() => reviewCampaign(c.id, true)} icon={<CheckCircle className="h-3 w-3" />}>Approve</Button>
                        <Button size="sm" variant="danger" onClick={() => reviewCampaign(c.id, false)} icon={<XCircle className="h-3 w-3" />}>Reject</Button>
                      </>
                    )}
                    {/* Only OWNER can pause/resume and delete */}
                    {isOwner && (c.status === "ACTIVE" || c.status === "PAUSED") && (
                      <Button size="sm" variant="outline" onClick={() => toggleStatus(c)}
                        icon={c.status === "ACTIVE" ? <Pause className="h-3 w-3" /> : <Play className="h-3 w-3" />}>
                        {c.status === "ACTIVE" ? "Pause" : "Resume"}
                      </Button>
                    )}
                    {isOwner && c.status === "ACTIVE" && (
                      <Button size="sm" variant="outline" onClick={() => { setNotifyTarget(c); setNotifyConfirmText(""); }} icon={<Mail className="h-3 w-3" />}>
                        Notify
                      </Button>
                    )}
                    {isOwner && (
                      <Button size="sm" variant="outline" loading={exportingId === c.id} onClick={() => exportClientReport(c.id)} icon={<Download className="h-3 w-3" />}>
                        Export
                      </Button>
                    )}
                    {isOwner && (
                      <Button size="sm" variant="outline" onClick={() => {
                        setHistoryTarget(c.id);
                        setHistoryLoading(true);
                        fetch(`/api/campaigns/${c.id}/events`).then((r) => r.json()).then(setHistoryEvents).catch(() => setHistoryEvents([])).finally(() => setHistoryLoading(false));
                      }} icon={<Clock className="h-3 w-3" />}>
                        History
                      </Button>
                    )}
                    {isOwner && (c.status === "ACTIVE" || c.status === "PAUSED") && (
                      <Button size="sm" variant="outline" onClick={() => flipPastStatus(c)} icon={<Archive className="h-3 w-3" />}>
                        Move to Past
                      </Button>
                    )}
                    {isOwner && c.status === "PAST" && (
                      <Button size="sm" variant="outline" onClick={() => flipPastStatus(c)} icon={<RotateCcw className="h-3 w-3" />}>
                        Reactivate
                      </Button>
                    )}
                    {isOwner && (
                      <Button size="sm" variant="outline" onClick={() => { setDeleteTarget(c); setDeleteConfirmText(""); }} icon={<Trash2 className="h-3 w-3" />}
                        className="text-red-400 hover:text-red-300 hover:border-red-400/30">
                        Archive
                      </Button>
                    )}
                  </div>
                )}
                {!canManage && (
                  <p className="mt-3 text-xs text-[var(--text-muted)]">View only (assigned by owner)</p>
                )}
              </Card>
            );
          })}
        </div>
      )}

      {/* Create / Edit Modal */}
      <Modal open={showModal} onClose={() => { setShowModal(false); setEditingId(null); }} title={editingId ? (isOwner ? "Edit campaign" : "Request campaign edit") : "Create campaign"} className="max-w-2xl">
        {!isOwner && editingId && (
          <div className="mb-4 rounded-xl border border-accent/20 bg-accent/5 px-4 py-2.5">
            <p className="text-sm text-accent">Changes will be submitted for owner review, not applied immediately.</p>
          </div>
        )}
        <form onSubmit={handleSubmit} className="space-y-5">
          <Input id="name" label="Campaign name *" value={form.name} onChange={(e) => updateField("name", e.target.value)} className="text-lg" />
          <div className="space-y-1.5">
            <label className="block text-sm font-medium text-[var(--text-primary)]">Platforms *</label>
            <div className="flex flex-wrap gap-2">
              {platformList.map((p) => (
                <button type="button" key={p.value} onClick={() => {
                  setForm((prev) => ({ ...prev, platforms: prev.platforms.includes(p.value) ? prev.platforms.filter((v) => v !== p.value) : [...prev.platforms, p.value] }));
                }} className={`rounded-xl border px-4 py-2 text-sm font-medium transition-all cursor-pointer ${form.platforms.includes(p.value) ? "border-accent bg-accent/10 text-accent" : "border-[var(--border-color)] text-[var(--text-secondary)] hover:bg-[var(--bg-input)]"}`}>
                  {p.label}
                </button>
              ))}
            </div>
          </div>
          <div className="space-y-2">
            <label className="block text-sm font-medium text-[var(--text-primary)]">Requirements *</label>
            <p className="text-xs text-[var(--text-muted)]">Add each requirement as a separate item.</p>
            {form.requirementsList.map((req, idx) => (
              <div key={idx} className="flex gap-2">
                <Input id={`req-${idx}`} placeholder={`Requirement ${idx + 1}`} value={req} onChange={(e) => updateRequirement(idx, e.target.value)} className="flex-1" />
                {form.requirementsList.length > 1 && (
                  <button type="button" onClick={() => removeRequirement(idx)} className="rounded-lg p-2 text-[var(--text-muted)] hover:text-red-400 hover:bg-red-500/5 transition-colors cursor-pointer">
                    <Trash2 className="h-4 w-4" />
                  </button>
                )}
              </div>
            ))}
            <button type="button" onClick={addRequirement} className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm text-accent hover:bg-accent/5 transition-colors cursor-pointer">
              <Plus className="h-3.5 w-3.5" /> Add requirement
            </button>
          </div>
          {/* Pricing model */}
          <div>
            <label className="block text-sm font-medium text-[var(--text-secondary)] mb-1.5">Pricing Model</label>
            <div className="flex gap-3">
              {[{ value: "AGENCY_FEE", label: "Agency Fee" }, { value: "CPM_SPLIT", label: "CPM Split" }].map((opt) => (
                <button key={opt.value} type="button" onClick={() => updateField("pricingModel", opt.value)}
                  className={`flex-1 rounded-xl border px-4 py-2.5 text-sm font-medium transition-colors cursor-pointer ${form.pricingModel === opt.value ? "border-accent bg-accent/10 text-accent" : "border-[var(--border-color)] text-[var(--text-secondary)] hover:bg-[var(--bg-card-hover)]"}`}>
                  {opt.label}
                </button>
              ))}
            </div>
            <p className="text-xs text-[var(--text-muted)] mt-1">
              {form.pricingModel === "AGENCY_FEE" ? "Budget covers clipper payouts only. Agency fee is separate." : "Budget covers both clipper and owner earnings per view."}
            </p>
          </div>
          {/* Campaign payout settings */}
          <div className="grid gap-4 sm:grid-cols-2">
            <Input id="clipperCpm" label="Clipper CPM ($)" type="number" step="0.01" placeholder="e.g. 1.00" value={form.clipperCpm} onChange={(e) => updateField("clipperCpm", e.target.value)} />
            {form.pricingModel === "CPM_SPLIT" ? (
              <Input id="ownerCpm" label="Owner CPM ($)" type="number" step="0.01" placeholder="e.g. 0.50" value={form.ownerCpm} onChange={(e) => updateField("ownerCpm", e.target.value)} />
            ) : (
              <Input id="agencyFee" label="Agency Fee ($)" type="number" step="0.01" placeholder="e.g. 500" value={form.agencyFee} onChange={(e) => updateField("agencyFee", e.target.value)} />
            )}
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <Input id="budget" label={form.pricingModel === "CPM_SPLIT" ? "Total Budget ($)" : "Clipper Budget ($)"} type="number" placeholder="e.g. 5000" value={form.budget} onChange={(e) => updateField("budget", e.target.value)} />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <Input id="maxPayoutPerClip" label="Max payout / clip ($)" type="number" step="0.01" value={form.maxPayoutPerClip} onChange={(e) => updateField("maxPayoutPerClip", e.target.value)} />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <Input id="minViews" label="Min views threshold" type="number" value={form.minViews} onChange={(e) => updateField("minViews", e.target.value)} />
            <div>
              <label htmlFor="maxClipsPerUserPerDay" className="mb-1 block text-sm font-medium text-[var(--text-secondary)]">Max clips / user / day</label>
              <select
                id="maxClipsPerUserPerDay"
                value={form.maxClipsPerUserPerDay}
                onChange={(e) => updateField("maxClipsPerUserPerDay", e.target.value)}
                className="w-full rounded-lg border border-[var(--border-color)] bg-[var(--bg-input)] px-3 py-2 text-sm text-[var(--text-primary)] focus:outline-none focus:ring-2 focus:ring-accent"
              >
                {Array.from({ length: isOwner ? 20 : 10 }, (_, i) => i + 1).map((n) => (
                  <option key={n} value={n}>{n} clip{n > 1 ? "s" : ""} per day</option>
                ))}
              </select>
              <p className="mt-1 text-xs text-[var(--text-muted)]">Max {isOwner ? 20 : 10} per user per day</p>
            </div>
          </div>
          {!editingId && isOwner && (
            <label className="flex items-start gap-3 rounded-lg border border-[var(--border-color)] bg-[var(--bg-input)] px-3 py-3 cursor-pointer hover:border-accent/40 transition-colors">
              <input
                type="checkbox"
                checked={!!form.announceOnDiscord}
                onChange={(e) => setForm({ ...form, announceOnDiscord: e.target.checked })}
                className="mt-0.5 h-4 w-4 accent-accent"
              />
              <span className="flex-1">
                <span className="block text-sm font-medium text-[var(--text-primary)]">Announce on Discord + email</span>
                <span className="block text-xs text-[var(--text-muted)] mt-0.5">DMs every active clipper via the Discord bot and sends a Resend email. Leave off for test campaigns.</span>
              </span>
            </label>
          )}
          <CampaignImageSlots
            value={{
              cardImageUrl: form.cardImageUrl || null,
              bannerImageUrl: form.bannerImageUrl || null,
              communityAvatarUrl: form.communityAvatarUrl || null,
            }}
            onChange={(next) =>
              setForm({
                ...form,
                cardImageUrl: next.cardImageUrl || "",
                bannerImageUrl: next.bannerImageUrl || "",
                communityAvatarUrl: next.communityAvatarUrl || "",
              })
            }
          />
          <Textarea id="examples" label="Examples (links or descriptions)" placeholder="https://tiktok.com/..." value={form.examples} onChange={(e) => updateField("examples", e.target.value)} />
          <div className="grid gap-4 sm:grid-cols-2">
            <Textarea id="captionRules" label="Caption rules" value={form.captionRules} onChange={(e) => updateField("captionRules", e.target.value)} />
            <Textarea id="hashtagRules" label="Hashtag rules" value={form.hashtagRules} onChange={(e) => updateField("hashtagRules", e.target.value)} />
          </div>
          <Textarea id="payoutRule" label="Payout rules" value={form.payoutRule} onChange={(e) => updateField("payoutRule", e.target.value)} />
          <Textarea id="aiKnowledge" label="Campaign Instructions for AI Chatbot" placeholder="Paste detailed info about this campaign — where to find content, posting rules, common clipper questions. The AI chatbot will use this to answer questions." value={form.aiKnowledge} onChange={(e) => updateField("aiKnowledge", e.target.value)} />
          {/* Target Audience */}
          <div className="space-y-3">
            <label className="text-sm font-medium text-[var(--text-primary)]">Target Audience</label>
            <div className="grid grid-cols-2 gap-2">
              {[
                { value: "usa", label: "USA", color: "bg-blue-500/10 text-blue-400 border-blue-500/20" },
                { value: "first_world", label: "First World Countries", color: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20" },
                { value: "worldwide", label: "Worldwide", color: "bg-purple-500/10 text-purple-400 border-purple-500/20" },
                { value: "custom", label: "Specific Countries", color: "bg-amber-500/10 text-amber-400 border-amber-500/20" },
              ].map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => {
                    const newVal = form.targetAudience === opt.value ? "" : opt.value;
                    setForm((prev) => ({ ...prev, targetAudience: newVal, ...(newVal !== "custom" ? { targetCountriesInput: "" } : {}) }));
                  }}
                  className={`px-4 py-3 rounded-xl border text-sm font-medium transition-colors cursor-pointer ${
                    form.targetAudience === opt.value ? opt.color : "border-[var(--border-color)] text-[var(--text-muted)] hover:border-accent/20"
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
            {form.targetAudience === "custom" && (
              <div className="space-y-2">
                <label className="text-xs text-[var(--text-muted)]">Select countries (comma-separated codes)</label>
                <Input
                  id="targetCountriesInput"
                  placeholder="US, UK, DE, FR"
                  value={form.targetCountriesInput}
                  onChange={(e) => updateField("targetCountriesInput", e.target.value.toUpperCase())}
                />
              </div>
            )}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-xs text-[var(--text-muted)]">Current account audience breakdown (optional)</label>
              </div>
              <p className="text-[10px] text-[var(--text-muted)]">If you know which countries the account currently reaches, add them with percentages</p>
              <Textarea
                id="accountCountriesInput"
                placeholder={"US: 45%\nUK: 30%\nDE: 25%"}
                value={form.accountCountriesInput}
                onChange={(e) => updateField("accountCountriesInput", e.target.value)}
                rows={3}
              />
            </div>
          </div>
          {/* Campaign Owner */}
          {isOwner && (
            <div className="space-y-2">
              <label className="text-sm font-medium text-[var(--text-primary)]">Campaign Owner</label>
              <select
                value={form.ownerUserId}
                onChange={(e) => updateField("ownerUserId", e.target.value)}
                className="w-full px-4 py-3 rounded-xl border border-[var(--border-color)] bg-[var(--bg-input)] text-sm text-[var(--text-primary)]"
              >
                <option value="">No specific owner (you manage it)</option>
                {ownerUsers.map((u) => (
                  <option key={u.id} value={u.id}>{u.username || u.name} ({u.role})</option>
                ))}
              </select>
              <p className="text-xs text-[var(--text-muted)]">The owner has full control. Admins only manage their assigned campaigns.</p>
            </div>
          )}
          <div className="grid gap-4 sm:grid-cols-2">
            <Input id="soundLink" label="Sound link (optional)" value={form.soundLink} onChange={(e) => updateField("soundLink", e.target.value)} />
            <Input id="assetLink" label="Asset link" value={form.assetLink} onChange={(e) => updateField("assetLink", e.target.value)} />
          </div>
          <div className="flex justify-end gap-3 pt-2">
            <Button type="button" variant="ghost" onClick={() => { setShowModal(false); setEditingId(null); }}>Cancel</Button>
            <Button type="submit" loading={submitting}>
              {editingId ? (isOwner ? "Save changes" : "Submit for review") : "Create campaign"}
            </Button>
          </div>
        </form>
      </Modal>

      {/* Archive Confirmation Modal */}
      <Modal open={!!deleteTarget} onClose={() => setDeleteTarget(null)} title="Archive campaign">
        {deleteTarget && (
          <div className="space-y-4">
            <div className="rounded-xl border border-red-500/20 bg-red-500/5 px-4 py-3">
              <p className="text-sm text-red-400">
                This will archive <strong>{deleteTarget.name}</strong>. It will be removed from all live views but preserved in your archive with full history.
              </p>
            </div>
            <div>
              <p className="text-sm text-[var(--text-secondary)] mb-2">
                Type <code className="rounded bg-[var(--bg-input)] px-1.5 py-0.5 text-xs font-bold text-[var(--text-primary)]">DELETE {deleteTarget.name.toUpperCase()}</code> to confirm:
              </p>
              <Input
                id="deleteConfirm"
                placeholder={`DELETE ${deleteTarget.name.toUpperCase()}`}
                value={deleteConfirmText}
                onChange={(e) => setDeleteConfirmText(e.target.value)}
              />
            </div>
            <div className="flex justify-end gap-3">
              <Button variant="ghost" onClick={() => setDeleteTarget(null)}>Cancel</Button>
              <Button
                variant="danger"
                loading={deleting}
                disabled={deleteConfirmText !== `DELETE ${deleteTarget.name.toUpperCase()}`}
                onClick={confirmDelete}
              >
                Archive campaign
              </Button>
            </div>
          </div>
        )}
      </Modal>

      {/* Notify Clippers Modal */}
      <Modal open={!!notifyTarget} onClose={() => setNotifyTarget(null)} title="Send campaign notification">
        {notifyTarget && (
          <div className="space-y-4">
            <div className="rounded-xl border border-accent/20 bg-accent/5 px-4 py-3">
              <p className="text-sm text-[var(--text-secondary)]">
                This will send an email to <strong className="text-[var(--text-primary)]">ALL active clippers</strong> about <strong className="text-accent">{notifyTarget.name}</strong>.
              </p>
            </div>
            <div>
              <p className="text-sm text-[var(--text-secondary)] mb-2">
                Type <code className="rounded bg-[var(--bg-input)] px-1.5 py-0.5 text-xs font-bold text-[var(--text-primary)]">NOTIFY</code> to confirm:
              </p>
              <Input
                id="notifyConfirm"
                placeholder="NOTIFY"
                value={notifyConfirmText}
                onChange={(e) => setNotifyConfirmText(e.target.value)}
              />
            </div>
            <div className="flex justify-end gap-3">
              <Button variant="ghost" onClick={() => setNotifyTarget(null)}>Cancel</Button>
              <Button
                loading={notifying}
                disabled={notifyConfirmText !== "NOTIFY"}
                onClick={sendNotification}
                icon={<Mail className="h-4 w-4" />}
              >
                Send Notification
              </Button>
            </div>
          </div>
        )}
      </Modal>

      {/* Pending Edit Diff Modal */}
      <Modal open={!!reviewingEdit} onClose={() => setReviewingEdit(null)} title="Review edit request" className="max-w-lg">
        {reviewingEdit && (() => {
          let changes: Record<string, any> = {};
          try { changes = JSON.parse(reviewingEdit.changes); } catch {}
          return (
            <div className="space-y-4">
              <div className="rounded-xl border border-blue-500/20 bg-blue-500/5 px-4 py-2.5">
                <p className="text-sm text-blue-400">
                  <strong>{reviewingEdit.requestedBy?.username || "Admin"}</strong> requested changes to <strong>{reviewingEdit.campaign?.name}</strong>
                </p>
              </div>
              <div className="space-y-3 max-h-[50vh] overflow-y-auto pr-1">
                {Object.entries(changes).map(([field, val]: [string, any]) => {
                  const oldVal = val?.old ?? "-";
                  const newVal = val?.new ?? val ?? "-";
                  return (
                    <div key={field} className="rounded-xl border border-[var(--border-color)] p-3">
                      <p className="text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)] mb-1.5">{field}</p>
                      <div className="grid gap-2 sm:grid-cols-2 text-sm">
                        <div>
                          <p className="text-[10px] text-red-400 mb-0.5">Before</p>
                          <p className="text-[var(--text-secondary)] break-words">{String(oldVal).substring(0, 200) || "-"}</p>
                        </div>
                        <div>
                          <p className="text-[10px] text-emerald-400 mb-0.5">After</p>
                          <p className="text-[var(--text-primary)] break-words">{String(newVal).substring(0, 200) || "-"}</p>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
              <div className="flex justify-end gap-3 pt-2">
                <Button variant="ghost" onClick={() => setReviewingEdit(null)}>Cancel</Button>
                <Button variant="danger" onClick={() => reviewEdit(reviewingEdit.id, false)} icon={<XCircle className="h-4 w-4" />}>Reject</Button>
                <Button onClick={() => reviewEdit(reviewingEdit.id, true)} icon={<CheckCircle className="h-4 w-4" />}>Approve</Button>
              </div>
            </div>
          );
        })()}
      </Modal>

      {/* Campaign History Modal */}
      <Modal open={!!historyTarget} onClose={() => setHistoryTarget(null)} title="Campaign History" className="max-w-lg">
        {historyLoading ? (
          <div className="flex justify-center py-8">
            <div className="h-6 w-6 animate-spin rounded-full border-2 border-[var(--border-color)] border-t-accent" />
          </div>
        ) : historyEvents.length === 0 ? (
          <p className="text-sm text-[var(--text-muted)] text-center py-6">No events recorded yet.</p>
        ) : (
          <div className="space-y-2 max-h-[60vh] overflow-y-auto pr-1">
            {historyEvents.map((event: any) => {
              const typeBg: Record<string, string> = {
                BUDGET_CHANGE: "bg-accent/10 text-accent border-accent/20",
                AUTO_PAUSED: "bg-amber-500/10 text-amber-400 border-amber-500/20",
                MANUAL_PAUSE: "bg-amber-500/10 text-amber-400 border-amber-500/20",
                AUTO_RESUMED: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20",
                MANUAL_RESUME: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20",
                ARCHIVED: "bg-zinc-500/10 text-zinc-400 border-zinc-500/20",
              };
              const badge = typeBg[event.type] || "bg-accent/10 text-accent border-accent/20";
              return (
                <div key={event.id} className="rounded-xl border border-[var(--border-color)] bg-[var(--bg-card)] p-3">
                  <div className="flex items-center gap-2 mb-1">
                    <span className={`inline-flex rounded-full border px-2 py-0.5 text-[10px] font-semibold ${badge}`}>
                      {event.type.replace(/_/g, " ")}
                    </span>
                    <span className="text-[10px] text-[var(--text-muted)] ml-auto">{formatRelative(event.createdAt)}</span>
                  </div>
                  <p className="text-sm text-[var(--text-primary)]">{event.description}</p>
                  <p className="text-[10px] text-[var(--text-muted)] mt-0.5">{event.user?.name || event.user?.username || "System"}</p>
                </div>
              );
            })}
          </div>
        )}
      </Modal>
    </div>
  );
}
