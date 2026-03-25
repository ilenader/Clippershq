"use client";

import { useEffect, useState } from "react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Users, Shield, ShieldCheck, User } from "lucide-react";
import { toast } from "sonner";
import { formatRelative } from "@/lib/utils";

const roleOptions = [
  { value: "CLIPPER", label: "Clipper", icon: <User className="h-3.5 w-3.5" />, description: "Standard user. Can submit clips and earn." },
  { value: "ADMIN", label: "Admin", icon: <Shield className="h-3.5 w-3.5" />, description: "Can create campaigns and review clips in own campaigns." },
  { value: "OWNER", label: "Owner", icon: <ShieldCheck className="h-3.5 w-3.5" />, description: "Full access. Can manage roles, payouts, all campaigns." },
];

const roleBadge: Record<string, string> = {
  CLIPPER: "active",
  ADMIN: "pending",
  OWNER: "rejected",  // Red color for OWNER to stand out
};

export default function TeamPage() {
  const [users, setUsers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [changing, setChanging] = useState<string | null>(null);

  const load = () => {
    fetch("/api/admin/users")
      .then((r) => r.json())
      .then((data) => setUsers(Array.isArray(data) ? data : []))
      .catch(() => {})
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  const changeRole = async (userId: string, newRole: string) => {
    setChanging(userId);
    try {
      const res = await fetch(`/api/admin/users/${userId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role: newRole }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed");
      toast.success(`Role updated to ${newRole}.`);
      // Optimistic update
      setUsers((prev) =>
        prev.map((u) => (u.id === userId ? { ...u, role: newRole } : u))
      );
    } catch (err: any) {
      toast.error(err.message || "Failed to update role.");
    }
    setChanging(null);
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
        <h1 className="text-2xl font-bold text-[var(--text-primary)]">Team & Access</h1>
        <p className="text-[15px] text-[var(--text-secondary)]">Manage user roles and permissions.</p>
      </div>

      {/* Role legend */}
      <div className="flex flex-wrap gap-4">
        {roleOptions.map((r) => (
          <div key={r.value} className="flex items-center gap-2 text-sm">
            <Badge variant={roleBadge[r.value] as any}>{r.label}</Badge>
            <span className="text-[var(--text-muted)]">{r.description}</span>
          </div>
        ))}
      </div>

      {users.length === 0 ? (
        <EmptyState
          icon={<Users className="h-10 w-10" />}
          title="No users"
          description="Users will appear here after they log in."
        />
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-[var(--border-color)]">
          <div className="grid grid-cols-[1fr_180px_100px_120px_200px] gap-3 px-5 py-3 bg-[var(--bg-secondary)] border-b border-[var(--border-color)] text-[11px] font-medium uppercase tracking-wider text-[var(--text-muted)]">
            <span>User</span>
            <span>Email</span>
            <span>Role</span>
            <span>Joined</span>
            <span>Change role</span>
          </div>
          {users.map((user: any) => (
            <div key={user.id} className="grid grid-cols-[1fr_180px_100px_120px_200px] gap-3 items-center px-5 py-3 border-b border-[var(--border-subtle)] last:border-b-0 hover:bg-[var(--bg-card-hover)] transition-colors">
              <div className="flex items-center gap-3 min-w-0">
                {user.image ? (
                  <img src={user.image} alt="" className="h-8 w-8 rounded-full" />
                ) : (
                  <div className="flex h-8 w-8 items-center justify-center rounded-full bg-accent/10 text-xs font-bold text-accent">
                    {(user.username || "?")[0].toUpperCase()}
                  </div>
                )}
                <div className="min-w-0">
                  <p className="text-sm font-medium text-[var(--text-primary)] truncate">{user.username || "user"}</p>
                  {user.discordId && (
                    <p className="text-[11px] text-[var(--text-muted)] truncate">Discord: {user.discordId}</p>
                  )}
                </div>
              </div>
              <span className="text-sm text-[var(--text-secondary)] truncate">{user.email || "—"}</span>
              <Badge variant={roleBadge[user.role] as any}>{user.role}</Badge>
              <span className="text-xs text-[var(--text-muted)]">{formatRelative(user.createdAt)}</span>
              <div className="flex gap-1">
                {roleOptions.map((r) => (
                  <button
                    key={r.value}
                    onClick={() => changeRole(user.id, r.value)}
                    disabled={user.role === r.value || changing === user.id}
                    className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-all cursor-pointer ${
                      user.role === r.value
                        ? "bg-accent/10 text-accent border border-accent/20"
                        : "text-[var(--text-secondary)] hover:bg-[var(--bg-input)] border border-[var(--border-color)]"
                    } disabled:opacity-50 disabled:cursor-not-allowed`}
                  >
                    {r.label}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
