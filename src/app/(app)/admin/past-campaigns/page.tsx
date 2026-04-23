"use client";

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import type { SessionUser } from "@/lib/auth-types";
import { useRouter } from "next/navigation";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";
import { EmptyState } from "@/components/ui/empty-state";
import { CampaignImageSlots, type CampaignImageUrls } from "@/components/ui/CampaignImageSlots";
import { Archive, Plus, Pencil, Trash2 } from "lucide-react";
import { toast } from "@/lib/toast";

/**
 * OWNER-only showcase management. Past campaigns here are marketing-only
 * display tiles that appear on /campaigns — no clips, no tracking, no
 * community. Uses the dedicated /api/campaigns/past-create endpoint rather
 * than the full campaign POST so the normal side effects (tracking jobs,
 * community channel, Discord broadcast) never fire.
 */

type Past = {
  id: string;
  name: string;
  platform: string;
  clientName: string | null;
  cardImageUrl: string | null;
  budget: number | null;
  manualSpent: number | null;
  minViews: number | null;
  clipperCpm: number | null;
  maxPayoutPerClip: number | null;
  maxClipsPerUserPerDay: number | null;
  createdAt: string;
  updatedAt: string;
};

const PLATFORMS = ["TikTok", "Instagram", "YouTube"];

const emptyForm = {
  id: "" as string | null,
  name: "",
  platform: "TikTok",
  clientName: "",
  cardImageUrl: "",
  budget: "",
  manualSpent: "",
  minViews: "",
  clipperCpm: "",
  maxPayoutPerClip: "",
  maxClipsPerUserPerDay: "3",
};

export default function AdminPastCampaignsPage() {
  const { data: session } = useSession();
  const router = useRouter();
  const role = (session?.user as SessionUser)?.role;

  useEffect(() => {
    if (session && role && role !== "OWNER") router.replace("/admin");
  }, [session, role, router]);

  const [rows, setRows] = useState<Past[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState<typeof emptyForm>(emptyForm);
  const [submitting, setSubmitting] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const load = () => {
    fetch("/api/campaigns/past-create")
      .then((r) => r.json())
      .then((data) => setRows(Array.isArray(data) ? data : []))
      .catch(() => setRows([]))
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  const openCreate = () => {
    setForm({ ...emptyForm, id: null });
    setShowModal(true);
  };

  const openEdit = (p: Past) => {
    setForm({
      id: p.id,
      name: p.name,
      platform: p.platform || "TikTok",
      clientName: p.clientName || "",
      cardImageUrl: p.cardImageUrl || "",
      budget: p.budget?.toString() || "",
      manualSpent: p.manualSpent?.toString() || "",
      minViews: p.minViews?.toString() || "",
      clipperCpm: p.clipperCpm?.toString() || "",
      maxPayoutPerClip: p.maxPayoutPerClip?.toString() || "",
      maxClipsPerUserPerDay: p.maxClipsPerUserPerDay?.toString() || "3",
    });
    setShowModal(true);
  };

  const setField = <K extends keyof typeof emptyForm>(k: K, v: (typeof emptyForm)[K]) => {
    setForm((f) => ({ ...f, [k]: v }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const required: [string, string][] = [
      ["name", "Campaign name"],
      ["platform", "Platform"],
      ["cardImageUrl", "Card image"],
      ["budget", "Budget"],
      ["manualSpent", "Spent"],
      ["minViews", "Min views"],
      ["clipperCpm", "Clipper CPM"],
      ["maxPayoutPerClip", "Max payout per clip"],
      ["maxClipsPerUserPerDay", "Daily clip limit"],
    ];
    for (const [k, label] of required) {
      if (!String(form[k as keyof typeof form] ?? "").trim()) {
        toast.error(`${label} is required.`);
        return;
      }
    }
    const budgetN = parseFloat(form.budget);
    const spentN = parseFloat(form.manualSpent);
    if (isFinite(budgetN) && isFinite(spentN) && spentN > budgetN) {
      toast.error("Spent cannot exceed budget.");
      return;
    }

    setSubmitting(true);
    try {
      const isEdit = !!form.id;
      const payload = {
        ...(isEdit ? { id: form.id } : {}),
        name: form.name.trim(),
        platform: form.platform,
        clientName: form.clientName.trim() || null,
        cardImageUrl: form.cardImageUrl,
        budget: budgetN,
        manualSpent: spentN,
        minViews: parseInt(form.minViews),
        clipperCpm: parseFloat(form.clipperCpm),
        maxPayoutPerClip: parseFloat(form.maxPayoutPerClip),
        maxClipsPerUserPerDay: parseInt(form.maxClipsPerUserPerDay),
      };
      const res = await fetch("/api/campaigns/past-create", {
        method: isEdit ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed");
      toast.success(isEdit ? "Past campaign updated." : "Past campaign created.");
      setShowModal(false);
      setForm(emptyForm);
      load();
    } catch (err: any) {
      toast.error(err.message || "Failed to save.");
    }
    setSubmitting(false);
  };

  const confirmDelete = async () => {
    if (!deleteId) return;
    try {
      const res = await fetch(`/api/campaigns/past-create?id=${deleteId}`, { method: "DELETE" });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Failed");
      }
      toast.success("Past campaign removed.");
      setDeleteId(null);
      load();
    } catch (err: any) {
      toast.error(err.message || "Failed to delete.");
    }
  };

  const imageSlotsValue: CampaignImageUrls = {
    cardImageUrl: form.cardImageUrl || null,
    bannerImageUrl: null,
    communityAvatarUrl: null,
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
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-[var(--text-primary)]">Past Campaigns</h1>
          <p className="text-[15px] text-[var(--text-secondary)]">
            Showcase previous successful campaigns. Display-only — no tracking, no joining.
          </p>
        </div>
        <Button onClick={openCreate} icon={<Plus className="h-4 w-4" />}>Create Past Campaign</Button>
      </div>

      {rows.length === 0 ? (
        <EmptyState
          icon={<Archive className="h-10 w-10" />}
          title="No past campaigns yet"
          description="Add showcase tiles for campaigns you've already run. They'll appear on the /campaigns page under Past Campaigns."
          action={<Button onClick={openCreate} icon={<Plus className="h-4 w-4" />}>Create Past Campaign</Button>}
        />
      ) : (
        <div className="space-y-3">
          {rows.map((p) => (
            <Card key={p.id}>
              <div className="flex items-center gap-4">
                <div className="h-14 w-14 flex-shrink-0 overflow-hidden rounded-lg bg-[var(--bg-input)]">
                  {p.cardImageUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={p.cardImageUrl} alt="" className="h-full w-full object-cover" />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center text-accent font-bold">{p.name[0]?.toUpperCase()}</div>
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-[var(--text-primary)]">{p.name}</p>
                  <p className="text-xs text-[var(--text-muted)]">
                    {p.platform}
                    {p.clientName ? ` · ${p.clientName}` : ""}
                    {" · "}${(p.manualSpent ?? 0).toLocaleString()} / ${(p.budget ?? 0).toLocaleString()}
                  </p>
                </div>
                <div className="flex gap-2">
                  <Button size="sm" variant="outline" onClick={() => openEdit(p)} icon={<Pencil className="h-3 w-3" />}>Edit</Button>
                  <Button size="sm" variant="outline" onClick={() => setDeleteId(p.id)} icon={<Trash2 className="h-3 w-3" />}
                    className="text-red-400 hover:text-red-300 hover:border-red-400/30">
                    Delete
                  </Button>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}

      <Modal open={showModal} onClose={() => setShowModal(false)} title={form.id ? "Edit Past Campaign" : "Create Past Campaign"} className="max-w-2xl">
        <form onSubmit={handleSubmit} className="space-y-5">
          <Input id="name" label="Campaign name *" value={form.name} onChange={(e) => setField("name", e.target.value)} />

          <div className="space-y-1.5">
            <label className="block text-sm font-medium text-[var(--text-primary)]">Platform *</label>
            <div className="flex flex-wrap gap-2">
              {PLATFORMS.map((p) => (
                <button type="button" key={p} onClick={() => setField("platform", p)}
                  className={`rounded-xl border px-4 py-2 text-sm font-medium transition-all cursor-pointer ${form.platform === p ? "border-accent bg-accent/10 text-accent" : "border-[var(--border-color)] text-[var(--text-secondary)] hover:bg-[var(--bg-input)]"}`}>
                  {p}
                </button>
              ))}
            </div>
          </div>

          <CampaignImageSlots
            value={imageSlotsValue}
            onChange={(next) => setField("cardImageUrl", next.cardImageUrl || "")}
            onlySlots={["card"]}
          />

          <div className="grid grid-cols-2 gap-3">
            <Input id="budget" type="number" step="0.01" min="0" label="Budget ($) *" value={form.budget} onChange={(e) => setField("budget", e.target.value)} />
            <Input id="manualSpent" type="number" step="0.01" min="0" label="Spent ($) *" value={form.manualSpent} onChange={(e) => setField("manualSpent", e.target.value)} />
            <Input id="minViews" type="number" min="0" label="Min views per clip *" value={form.minViews} onChange={(e) => setField("minViews", e.target.value)} />
            <Input id="clipperCpm" type="number" step="0.01" min="0" label="Clipper CPM ($) *" value={form.clipperCpm} onChange={(e) => setField("clipperCpm", e.target.value)} />
            <Input id="maxPayoutPerClip" type="number" step="0.01" min="0" label="Max payout per clip ($) *" value={form.maxPayoutPerClip} onChange={(e) => setField("maxPayoutPerClip", e.target.value)} />
            <Input id="maxClipsPerUserPerDay" type="number" min="1" label="Daily clip limit *" value={form.maxClipsPerUserPerDay} onChange={(e) => setField("maxClipsPerUserPerDay", e.target.value)} />
          </div>

          <Input id="clientName" label="Client name (optional)" placeholder='For "ran for X" display' value={form.clientName} onChange={(e) => setField("clientName", e.target.value)} />

          <div className="sticky bottom-0 bg-[var(--bg-card)] pt-3 pb-1 border-t border-[var(--border-color)] -mx-6 px-6 -mb-6">
            <div className="flex justify-end gap-3">
              <Button type="button" variant="ghost" onClick={() => setShowModal(false)}>Cancel</Button>
              <Button type="submit" loading={submitting}>{form.id ? "Save Changes" : "Create"}</Button>
            </div>
          </div>
        </form>
      </Modal>

      <Modal open={!!deleteId} onClose={() => setDeleteId(null)} title="Remove past campaign?">
        <div className="space-y-4">
          <p className="text-sm text-[var(--text-secondary)]">
            This tile will be removed from the /campaigns showcase. The record is soft-deleted so it can be restored from the database if needed.
          </p>
          <div className="flex justify-end gap-3">
            <Button variant="ghost" onClick={() => setDeleteId(null)}>Cancel</Button>
            <Button variant="danger" onClick={confirmDelete}>Remove</Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
