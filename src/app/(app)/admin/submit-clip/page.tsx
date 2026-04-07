"use client";

import { useEffect, useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Film, Upload } from "lucide-react";
import { toast } from "@/lib/toast";
import { formatCurrency } from "@/lib/utils";

export default function OwnerSubmitClipPage() {
  const [campaigns, setCampaigns] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [form, setForm] = useState({ campaignId: "", clipUrl: "", note: "", customCpm: "" });

  useEffect(() => {
    fetch("/api/campaigns?scope=manage")
      .then((r) => r.json())
      .then((data) => setCampaigns(Array.isArray(data) ? data : []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const selectedCampaign = campaigns.find((c: any) => c.id === form.campaignId);
  const campaignCpm = selectedCampaign?.clipperCpm ?? selectedCampaign?.cpmRate ?? 0;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.campaignId || !form.clipUrl) {
      toast.error("Campaign and clip URL are required.");
      return;
    }
    setSubmitting(true);
    try {
      const body: any = { campaignId: form.campaignId, clipUrl: form.clipUrl, note: form.note };
      if (form.customCpm) {
        const cpm = parseFloat(form.customCpm);
        if (cpm > 0) body.customCpm = cpm;
      }
      const res = await fetch("/api/clips/owner-submit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed");
      toast.success("Clip submitted and auto-approved. Tracking starts in 24h.");
      setForm({ campaignId: "", clipUrl: "", note: "", customCpm: "" });
    } catch (err: any) {
      toast.error(err.message || "Submission failed.");
    }
    setSubmitting(false);
  };

  if (loading) {
    return <div className="flex items-center justify-center py-20"><div className="h-8 w-8 animate-spin rounded-full border-2 border-[var(--border-color)] border-t-accent" /></div>;
  }

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-[var(--text-primary)]">Owner Clip Submit</h1>
        <p className="text-[15px] text-[var(--text-secondary)]">Submit clips without restrictions. Auto-approved, tracking starts at 24h intervals.</p>
      </div>

      <Card>
        <div className="rounded-xl border border-accent/20 bg-accent/5 px-4 py-3 mb-5">
          <p className="text-xs text-accent font-medium">Owner Override Mode</p>
          <p className="text-xs text-[var(--text-muted)] mt-1">Clip is auto-approved. Earnings calculate from views. Counts toward campaign budget.</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <Select
            id="campaignId"
            label="Campaign *"
            options={campaigns.map((c: any) => ({ value: c.id, label: `${c.name} (${c.platform})` }))}
            placeholder="Select campaign"
            value={form.campaignId}
            onChange={(e) => setForm({ ...form, campaignId: e.target.value, customCpm: "" })}
          />

          {selectedCampaign && (
            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-lg bg-[var(--bg-input)] border border-[var(--border-subtle)] px-3 py-2">
                <p className="text-[11px] text-[var(--text-muted)]">Campaign CPM</p>
                <p className="text-sm font-semibold text-[var(--text-primary)]">{formatCurrency(campaignCpm)}</p>
              </div>
              <div className="rounded-lg bg-[var(--bg-input)] border border-[var(--border-subtle)] px-3 py-2">
                <p className="text-[11px] text-[var(--text-muted)]">Budget</p>
                <p className="text-sm font-semibold text-[var(--text-primary)]">
                  {selectedCampaign.budget ? formatCurrency(selectedCampaign.budget) : "No limit"}
                </p>
              </div>
            </div>
          )}

          <Input
            id="clipUrl"
            label="Clip URL *"
            placeholder="https://tiktok.com/@user/video/..."
            value={form.clipUrl}
            onChange={(e) => setForm({ ...form, clipUrl: e.target.value })}
          />
          <Input
            id="customCpm"
            label={`Custom CPM (optional, max ${formatCurrency(campaignCpm)})`}
            placeholder={campaignCpm > 0 ? `Default: ${campaignCpm}` : "Campaign has no CPM set"}
            value={form.customCpm}
            onChange={(e) => setForm({ ...form, customCpm: e.target.value })}
          />
          <Input
            id="note"
            label="Note (optional)"
            placeholder="e.g. Manual submission for testing"
            value={form.note}
            onChange={(e) => setForm({ ...form, note: e.target.value })}
          />
          <div className="flex justify-end gap-3 pt-2">
            <Button type="submit" loading={submitting} icon={<Upload className="h-4 w-4" />}>
              Submit Clip
            </Button>
          </div>
        </form>
      </Card>
    </div>
  );
}
