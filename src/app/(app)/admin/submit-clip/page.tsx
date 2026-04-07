"use client";

import { useEffect, useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { EmptyState } from "@/components/ui/empty-state";
import { Film, Upload } from "lucide-react";
import { toast } from "@/lib/toast";

export default function OwnerSubmitClipPage() {
  const [campaigns, setCampaigns] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [form, setForm] = useState({ campaignId: "", clipUrl: "", note: "" });

  useEffect(() => {
    fetch("/api/campaigns?scope=manage")
      .then((r) => r.json())
      .then((data) => setCampaigns(Array.isArray(data) ? data : []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.campaignId || !form.clipUrl) {
      toast.error("Campaign and clip URL are required.");
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch("/api/clips/owner-submit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed");
      toast.success("Clip submitted successfully (owner override).");
      setForm({ campaignId: "", clipUrl: "", note: "" });
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
        <p className="text-[15px] text-[var(--text-secondary)]">Submit clips without restrictions. No 2-hour window, no membership required.</p>
      </div>

      <Card>
        <div className="rounded-xl border border-accent/20 bg-accent/5 px-4 py-3 mb-5">
          <p className="text-xs text-accent font-medium">Owner Override Mode</p>
          <p className="text-xs text-[var(--text-muted)] mt-1">This bypasses all clipper restrictions. Clip will be tracked normally after submission.</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <Select
            id="campaignId"
            label="Campaign *"
            options={campaigns.map((c: any) => ({ value: c.id, label: `${c.name} (${c.platform})` }))}
            placeholder="Select campaign"
            value={form.campaignId}
            onChange={(e) => setForm({ ...form, campaignId: e.target.value })}
          />
          <Input
            id="clipUrl"
            label="Clip URL *"
            placeholder="https://tiktok.com/@user/video/..."
            value={form.clipUrl}
            onChange={(e) => setForm({ ...form, clipUrl: e.target.value })}
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
