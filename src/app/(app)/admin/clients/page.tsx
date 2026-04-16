"use client";

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import type { SessionUser } from "@/lib/auth-types";
import { useRouter } from "next/navigation";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";
import { EmptyState } from "@/components/ui/empty-state";
import { Users, Plus, Mail, Trash2, Megaphone } from "lucide-react";
import { toast } from "@/lib/toast";
import { formatDate } from "@/lib/utils";

export default function AdminClientsPage() {
  const { data: session } = useSession();
  const router = useRouter();
  const userRole = (session?.user as SessionUser)?.role;

  useEffect(() => {
    if (session && userRole && userRole !== "OWNER") router.replace("/admin");
  }, [session, userRole, router]);

  const [clients, setClients] = useState<any[]>([]);
  const [campaigns, setCampaigns] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [form, setForm] = useState({ email: "", name: "", campaignId: "" });

  const load = () => {
    Promise.all([
      fetch("/api/admin/clients").then((r) => r.json()),
      fetch("/api/campaigns?scope=manage").then((r) => r.json()),
    ])
      .then(([clientsData, campaignsData]) => {
        setClients(Array.isArray(clientsData) ? clientsData : []);
        setCampaigns(Array.isArray(campaignsData) ? campaignsData : []);
      })
      .catch(() => { /* silent */ })
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.email || !form.campaignId) {
      toast.error("Email and campaign are required.");
      return;
    }
    setSubmitting(true);
    try {
      // Create/assign client
      const res = await fetch("/api/admin/clients", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: form.email.trim(), campaignId: form.campaignId }),
      });
      if (!res.ok) { const data = await res.json(); throw new Error(data.error || "Failed"); }

      // Send magic link invite
      await fetch("/api/auth/magic-link", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: form.email.trim() }),
      });

      toast.success("Client added and invite sent!");
      setShowModal(false);
      setForm({ email: "", name: "", campaignId: "" });
      load();
    } catch (err: any) {
      toast.error(err.message || "Failed to add client.");
    }
    setSubmitting(false);
  };

  const resendLink = async (email: string) => {
    try {
      await fetch("/api/auth/magic-link", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      toast.success("Invite link sent!");
    } catch {
      toast.error("Failed to send link.");
    }
  };

  const removeAssignment = async (userId: string, campaignId: string) => {
    try {
      const res = await fetch(`/api/admin/clients?userId=${userId}&campaignId=${campaignId}`, { method: "DELETE" });
      if (!res.ok) throw new Error();
      toast.success("Campaign removed from client.");
      load();
    } catch {
      toast.error("Failed to remove assignment.");
    }
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
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-[var(--text-primary)]">Brand Clients</h1>
          <p className="text-[15px] text-[var(--text-secondary)]">Manage client access to campaigns.</p>
        </div>
        <Button onClick={() => setShowModal(true)} icon={<Plus className="h-4 w-4" />}>Add Client</Button>
      </div>

      {clients.length === 0 ? (
        <EmptyState
          icon={<Users className="h-10 w-10" />}
          title="No clients yet"
          description="Add a brand client and assign them to a campaign."
          action={<Button onClick={() => setShowModal(true)} icon={<Plus className="h-4 w-4" />}>Add Client</Button>}
        />
      ) : (
        <div className="space-y-4">
          {clients.map((client: any) => (
            <Card key={client.id}>
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold text-[var(--text-primary)]">{client.name || client.email}</p>
                  <p className="text-xs text-[var(--text-muted)]">{client.email} · Joined {formatDate(client.createdAt)}</p>
                </div>
                <Button size="sm" variant="outline" onClick={() => resendLink(client.email)} icon={<Mail className="h-3 w-3" />}>
                  Resend Link
                </Button>
              </div>
              {client.campaignClients?.length > 0 ? (
                <div className="mt-3 space-y-2">
                  {client.campaignClients.map((cc: any) => (
                    <div key={cc.campaignId} className="flex items-center justify-between rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-secondary)] px-3 py-2">
                      <div className="flex items-center gap-2">
                        <Megaphone className="h-3.5 w-3.5 text-accent" />
                        <span className="text-sm text-[var(--text-secondary)]">{cc.campaign?.name || cc.campaignId}</span>
                      </div>
                      <button onClick={() => removeAssignment(client.id, cc.campaignId)} className="rounded-md p-1 text-red-400 hover:bg-red-500/10 transition-colors cursor-pointer">
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="mt-2 text-xs text-[var(--text-muted)]">No campaigns assigned.</p>
              )}
            </Card>
          ))}
        </div>
      )}

      <Modal open={showModal} onClose={() => setShowModal(false)} title="Add Client">
        <form onSubmit={handleAdd} className="space-y-4">
          <Input id="email" label="Client email *" placeholder="client@brand.com" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
          <div>
            <label className="block text-sm font-medium text-[var(--text-primary)] mb-1.5">Campaign *</label>
            <select
              value={form.campaignId}
              onChange={(e) => setForm({ ...form, campaignId: e.target.value })}
              className="w-full rounded-xl border border-[var(--border-color)] bg-[var(--bg-input)] px-4 py-2.5 text-sm text-[var(--text-primary)] outline-none focus:border-accent transition-colors"
            >
              <option value="">Select campaign</option>
              {campaigns.map((c: any) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </div>
          <div className="sticky bottom-0 bg-[var(--bg-card)] pt-3 pb-1 border-t border-[var(--border-color)] -mx-6 px-6 -mb-6">
            <div className="flex justify-end gap-3">
              <Button type="button" variant="ghost" onClick={() => setShowModal(false)}>Cancel</Button>
              <Button type="submit" loading={submitting}>Add & Send Invite</Button>
            </div>
          </div>
        </form>
      </Modal>
    </div>
  );
}
