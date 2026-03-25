"use client";

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { Card, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Modal } from "@/components/ui/modal";
import { EmptyState } from "@/components/ui/empty-state";
import { MultiDropdown } from "@/components/ui/dropdown-filter";
import { ImageUpload } from "@/components/ui/image-upload";
import { formatCurrency, formatNumber, formatDate } from "@/lib/utils";
import { Plus, Megaphone, Pause, Play, Pencil, Trash2 } from "lucide-react";
import { toast } from "sonner";

const platformList = [
  { value: "TikTok", label: "TikTok" },
  { value: "Instagram", label: "Instagram" },
  { value: "YouTube", label: "YouTube" },
  { value: "Twitter", label: "Twitter / X" },
  { value: "Snapchat", label: "Snapchat" },
];

const statusFilterOptions = [
  { value: "ACTIVE", label: "Active" },
  { value: "PAUSED", label: "Paused" },
];

const defaultForm = {
  name: "", clientName: "", platforms: [] as string[], budget: "", cpmRate: "",
  payoutRule: "", minViews: "", maxPayoutPerClip: "",
  requirementsList: [""] as string[],
  examples: "", soundLink: "", assetLink: "", imageUrl: "",
  captionRules: "", hashtagRules: "",
  startDate: "",
};

export default function AdminCampaignsPage() {
  const { data: session } = useSession();
  const userRole = (session?.user as any)?.role || "CLIPPER";
  const userId = session?.user?.id;
  const isOwner = userRole === "OWNER";

  const [campaigns, setCampaigns] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [form, setForm] = useState(defaultForm);
  const [filterStatuses, setFilterStatuses] = useState<string[]>([]);
  const [spendByCampaign, setSpendByCampaign] = useState<Record<string, number>>({});

  const load = () => {
    Promise.all([
      fetch("/api/campaigns?scope=manage").then((r) => r.json()),
      fetch("/api/clips").then((r) => r.json()).catch(() => []),
    ])
      .then(([campaignData, clipsData]) => {
        setCampaigns(Array.isArray(campaignData) ? campaignData : []);
        const map: Record<string, number> = {};
        const clips = Array.isArray(clipsData) ? clipsData : [];
        for (const clip of clips) {
          if (clip.campaignId && clip.status === "APPROVED" && clip.earnings > 0) {
            map[clip.campaignId] = (map[clip.campaignId] || 0) + clip.earnings;
          }
        }
        setSpendByCampaign(map);
      })
      .catch(() => setCampaigns([]))
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  const filteredCampaigns = filterStatuses.length > 0
    ? campaigns.filter((c: any) => filterStatuses.includes(c.status))
    : campaigns;

  // Check if current user owns a campaign
  const isMyCreation = (c: any) => c.createdById === userId;

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
      name: c.name || "", clientName: c.clientName || "",
      platforms: c.platform ? c.platform.split(",").map((p: string) => p.trim()) : [],
      budget: c.budget?.toString() || "", cpmRate: c.cpmRate?.toString() || "",
      payoutRule: c.payoutRule || "", minViews: c.minViews?.toString() || "",
      maxPayoutPerClip: c.maxPayoutPerClip?.toString() || "",
      requirementsList: reqs.length > 0 ? reqs : [""],
      examples: c.examples || "", soundLink: c.soundLink || "", assetLink: c.assetLink || "",
      imageUrl: c.imageUrl || "", captionRules: c.captionRules || "", hashtagRules: c.hashtagRules || "",
      startDate: c.startDate ? new Date(c.startDate).toISOString().split("T")[0] : "",
    });
    setShowModal(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name || form.platforms.length === 0) {
      toast.error("Name and at least one platform are required.");
      return;
    }
    setSubmitting(true);
    try {
      const requirements = form.requirementsList.filter((r) => r.trim()).join("\n");
      const payload: Record<string, any> = {
        name: form.name, clientName: form.clientName, platform: form.platforms.join(", "),
        budget: form.budget, cpmRate: form.cpmRate, payoutRule: form.payoutRule,
        minViews: form.minViews, maxPayoutPerClip: form.maxPayoutPerClip, requirements,
        examples: form.examples, soundLink: form.soundLink, assetLink: form.assetLink,
        imageUrl: form.imageUrl, captionRules: form.captionRules, hashtagRules: form.hashtagRules,
        startDate: form.startDate,
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
        toast.success("Campaign created.");
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

  const [deleteTarget, setDeleteTarget] = useState<any | null>(null);
  const [deleteConfirmText, setDeleteConfirmText] = useState("");
  const [deleting, setDeleting] = useState(false);

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
            const canManage = isOwner || isMyCreation(c);
            return (
              <Card key={c.id}>
                <div className="flex items-start gap-4">
                  {c.imageUrl && (
                    <div className="h-16 w-16 flex-shrink-0 overflow-hidden rounded-xl border border-[var(--border-color)]">
                      <img src={c.imageUrl} alt="" className="h-full w-full object-cover" />
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between">
                      <div>
                        <CardTitle>{c.name}</CardTitle>
                        <CardDescription>{c.platform?.replace(/,\s*/g, " · ")} {c.clientName && `· ${c.clientName}`}</CardDescription>
                      </div>
                      <Badge variant={c.status.toLowerCase() as any}>{c.status}</Badge>
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
                <div className="mt-3 flex flex-wrap gap-3 text-sm text-[var(--text-muted)]">
                  {c.cpmRate != null && <span>CPM: {formatCurrency(c.cpmRate)}</span>}
                  {c.budget != null && <span>Budget: {formatCurrency(c.budget)}</span>}
                  {c.minViews != null && <span>Min: {formatNumber(c.minViews)}</span>}
                  <span>{formatDate(c.createdAt)}</span>
                </div>
                {/* Actions — only show for campaigns user can manage */}
                {canManage && (
                  <div className="mt-4 flex gap-2">
                    <Button size="sm" variant="outline" onClick={() => openEdit(c)} icon={<Pencil className="h-3 w-3" />}>
                      {isOwner ? "Edit" : "Request edit"}
                    </Button>
                    {/* Only OWNER can pause/resume and delete */}
                    {isOwner && (c.status === "ACTIVE" || c.status === "PAUSED") && (
                      <Button size="sm" variant="outline" onClick={() => toggleStatus(c)}
                        icon={c.status === "ACTIVE" ? <Pause className="h-3 w-3" /> : <Play className="h-3 w-3" />}>
                        {c.status === "ACTIVE" ? "Pause" : "Resume"}
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
                  <p className="mt-3 text-xs text-[var(--text-muted)]">View only — assigned by owner</p>
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
            <p className="text-sm text-accent">Changes will be submitted for owner review — not applied immediately.</p>
          </div>
        )}
        <form onSubmit={handleSubmit} className="max-h-[70vh] space-y-5 overflow-y-auto pr-2">
          <Input id="name" label="Campaign name *" value={form.name} onChange={(e) => updateField("name", e.target.value)} className="text-lg" />
          <div className="grid gap-4 sm:grid-cols-2">
            <Input id="clientName" label="Client name" value={form.clientName} onChange={(e) => updateField("clientName", e.target.value)} />
            <Input id="startDate" label="Start date" type="date" value={form.startDate} onChange={(e) => updateField("startDate", e.target.value)} />
          </div>
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
          <div className="grid gap-4 sm:grid-cols-3">
            <Input id="budget" label="Budget ($)" type="number" value={form.budget} onChange={(e) => updateField("budget", e.target.value)} />
            <Input id="cpmRate" label="CPM rate ($)" type="number" step="0.01" value={form.cpmRate} onChange={(e) => updateField("cpmRate", e.target.value)} />
            <Input id="maxPayoutPerClip" label="Max payout / clip ($)" type="number" step="0.01" value={form.maxPayoutPerClip} onChange={(e) => updateField("maxPayoutPerClip", e.target.value)} />
          </div>
          <Input id="minViews" label="Min views threshold" type="number" value={form.minViews} onChange={(e) => updateField("minViews", e.target.value)} />
          <ImageUpload label="Campaign image" value={form.imageUrl} onChange={(url) => updateField("imageUrl", url)} />
          <Textarea id="examples" label="Examples (links or descriptions)" placeholder="https://tiktok.com/..." value={form.examples} onChange={(e) => updateField("examples", e.target.value)} />
          <div className="grid gap-4 sm:grid-cols-2">
            <Textarea id="captionRules" label="Caption rules" value={form.captionRules} onChange={(e) => updateField("captionRules", e.target.value)} />
            <Textarea id="hashtagRules" label="Hashtag rules" value={form.hashtagRules} onChange={(e) => updateField("hashtagRules", e.target.value)} />
          </div>
          <Textarea id="payoutRule" label="Payout rules" value={form.payoutRule} onChange={(e) => updateField("payoutRule", e.target.value)} />
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
    </div>
  );
}
