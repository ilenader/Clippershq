"use client";

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import type { SessionUser } from "@/lib/auth-types";
import { useRouter } from "next/navigation";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Modal } from "@/components/ui/modal";
import { EmptyState } from "@/components/ui/empty-state";
import { Users, Shield, ShieldCheck, User, Plus, Trash2, Search, Megaphone, UserPlus, X } from "lucide-react";
import { toast } from "@/lib/toast";
import { formatRelative, formatCurrency } from "@/lib/utils";

const roleOptions = [
  { value: "CLIPPER", label: "Clipper", icon: <User className="h-3.5 w-3.5" />, description: "Standard user. Can submit clips and earn." },
  { value: "ADMIN", label: "Admin", icon: <Shield className="h-3.5 w-3.5" />, description: "Can create campaigns and review clips in own campaigns." },
  { value: "OWNER", label: "Owner", icon: <ShieldCheck className="h-3.5 w-3.5" />, description: "Full access. Can manage roles, payouts, all campaigns." },
];

const roleBadge: Record<string, string> = {
  CLIPPER: "active",
  ADMIN: "pending",
  OWNER: "rejected",
};

export default function TeamPage() {
  const { data: session } = useSession();
  const userRole = (session?.user as SessionUser | undefined)?.role || "CLIPPER";
  const isOwner = userRole === "OWNER";
  const router = useRouter();

  // ── Users state ──
  const [users, setUsers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [changing, setChanging] = useState<string | null>(null);
  const [userSearch, setUserSearch] = useState("");

  // ── Teams state (owner only) ──
  const [teams, setTeams] = useState<any[]>([]);
  const [teamsLoading, setTeamsLoading] = useState(true);
  const [showCreateTeam, setShowCreateTeam] = useState(false);
  const [newTeamName, setNewTeamName] = useState("");
  const [creatingTeam, setCreatingTeam] = useState(false);

  // ── Team member/campaign modals ──
  const [managingTeam, setManagingTeam] = useState<any | null>(null);
  const [addMemberEmail, setAddMemberEmail] = useState("");
  const [addingMember, setAddingMember] = useState(false);

  // ── Campaign assignment ──
  const [campaigns, setCampaigns] = useState<any[]>([]);
  const [assignCampaignId, setAssignCampaignId] = useState("");
  const [assigningCampaign, setAssigningCampaign] = useState(false);

  const loadUsers = () => {
    fetch("/api/admin/users")
      .then((r) => r.json())
      .then((data) => setUsers(Array.isArray(data) ? data : []))
      .catch(() => {})
      .finally(() => setLoading(false));
  };

  const loadTeams = () => {
    if (!isOwner) { setTeamsLoading(false); return; }
    fetch("/api/admin/teams")
      .then((r) => r.json())
      .then((data) => setTeams(Array.isArray(data) ? data : []))
      .catch(() => {})
      .finally(() => setTeamsLoading(false));
  };

  const loadCampaigns = () => {
    fetch("/api/campaigns?scope=manage")
      .then((r) => r.json())
      .then((data) => setCampaigns(Array.isArray(data) ? data : []))
      .catch(() => {});
  };

  useEffect(() => {
    loadUsers();
    loadTeams();
    loadCampaigns();
  }, []);

  // ── User role change ──
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
      setUsers((prev) => prev.map((u) => (u.id === userId ? { ...u, role: newRole } : u)));
    } catch (err: any) {
      toast.error(err.message || "Failed to update role.");
    }
    setChanging(null);
  };

  // ── Team CRUD ──
  const createTeam = async () => {
    if (!newTeamName.trim()) return;
    setCreatingTeam(true);
    try {
      const res = await fetch("/api/admin/teams", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newTeamName.trim() }),
      });
      if (!res.ok) throw new Error("Failed to create team");
      toast.success("Team created.");
      setNewTeamName("");
      setShowCreateTeam(false);
      loadTeams();
    } catch (err: any) {
      toast.error(err.message);
    }
    setCreatingTeam(false);
  };

  const deleteTeam = async (teamId: string) => {
    try {
      const res = await fetch(`/api/admin/teams/${teamId}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Failed");
      toast.success("Team deleted.");
      setManagingTeam(null);
      loadTeams();
    } catch (err: any) {
      toast.error(err.message);
    }
  };

  const addMember = async () => {
    if (!addMemberEmail.trim() || !managingTeam) return;
    setAddingMember(true);
    try {
      const res = await fetch(`/api/admin/teams/${managingTeam.id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "addMember", email: addMemberEmail.trim() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed");
      toast.success("Member added.");
      setAddMemberEmail("");
      loadTeams();
      loadUsers(); // Role may have changed
    } catch (err: any) {
      toast.error(err.message);
    }
    setAddingMember(false);
  };

  const removeMember = async (teamId: string, userId: string) => {
    try {
      const res = await fetch(`/api/admin/teams/${teamId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "removeMember", userId }),
      });
      if (!res.ok) throw new Error("Failed");
      toast.success("Member removed.");
      loadTeams();
    } catch (err: any) {
      toast.error(err.message);
    }
  };

  const assignCampaign = async () => {
    if (!assignCampaignId || !managingTeam) return;
    setAssigningCampaign(true);
    try {
      const res = await fetch(`/api/admin/teams/${managingTeam.id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "assignCampaign", campaignId: assignCampaignId }),
      });
      if (!res.ok) throw new Error("Failed");
      toast.success("Campaign assigned to team.");
      setAssignCampaignId("");
      loadTeams();
    } catch (err: any) {
      toast.error(err.message);
    }
    setAssigningCampaign(false);
  };

  // ── Filter users by search ──
  const filteredUsers = users.filter((u) => {
    if (!userSearch.trim()) return true;
    const q = userSearch.toLowerCase();
    return (
      u.username?.toLowerCase().includes(q) ||
      u.name?.toLowerCase().includes(q) ||
      u.email?.toLowerCase().includes(q) ||
      u.discordId?.toLowerCase().includes(q)
    );
  });

  // Update managingTeam when teams refresh
  useEffect(() => {
    if (managingTeam) {
      const updated = teams.find((t: any) => t.id === managingTeam.id);
      if (updated) setManagingTeam(updated);
    }
  }, [teams]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-[var(--border-color)] border-t-accent" />
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {/* ── Header ── */}
      <div>
        <h1 className="text-2xl font-bold text-[var(--text-primary)]">Team & Access</h1>
        <p className="text-[15px] text-[var(--text-secondary)]">Manage user roles, teams, and permissions.</p>
      </div>

      {/* ══════════════════════════════════════════════════
          SECTION 1: TEAMS (Owner only)
         ══════════════════════════════════════════════════ */}
      {isOwner && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-[var(--text-primary)]">Teams</h2>
            <Button size="sm" onClick={() => setShowCreateTeam(true)} icon={<Plus className="h-3.5 w-3.5" />}>
              New Team
            </Button>
          </div>

          {teamsLoading ? (
            <div className="flex justify-center py-8">
              <div className="h-6 w-6 animate-spin rounded-full border-2 border-[var(--border-color)] border-t-accent" />
            </div>
          ) : teams.length === 0 ? (
            <Card>
              <div className="py-4 text-center">
                <Users className="h-8 w-8 mx-auto text-[var(--text-muted)] mb-2 opacity-40" />
                <p className="text-sm text-[var(--text-muted)]">No teams yet. Create one to organize admin access.</p>
              </div>
            </Card>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2">
              {teams.map((team: any) => (
                <Card key={team.id} hover className="cursor-pointer" onClick={() => setManagingTeam(team)}>
                  <div className="flex items-start justify-between">
                    <div>
                      <p className="text-[15px] font-semibold text-[var(--text-primary)]">{team.name}</p>
                      <div className="flex items-center gap-3 mt-1 text-sm text-[var(--text-muted)]">
                        <span className="flex items-center gap-1"><Users className="h-3.5 w-3.5" /> {team.members?.length || 0} member{(team.members?.length || 0) !== 1 ? "s" : ""}</span>
                        <span className="flex items-center gap-1"><Megaphone className="h-3.5 w-3.5" /> {team.campaigns?.length || 0} campaign{(team.campaigns?.length || 0) !== 1 ? "s" : ""}</span>
                      </div>
                    </div>
                    <Badge variant="pending">Team</Badge>
                  </div>
                  {team.members?.length > 0 && (
                    <div className="mt-3 flex flex-wrap gap-1.5">
                      {team.members.slice(0, 5).map((m: any) => (
                        <span key={m.userId} className="rounded-lg bg-[var(--bg-input)] px-2 py-1 text-xs text-[var(--text-secondary)]">
                          {m.user?.username || m.user?.email || "user"}
                        </span>
                      ))}
                      {team.members.length > 5 && <span className="text-xs text-[var(--text-muted)]">+{team.members.length - 5} more</span>}
                    </div>
                  )}
                </Card>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ══════════════════════════════════════════════════
          SECTION 2: USER ROLES
         ══════════════════════════════════════════════════ */}
      <div className="space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <h2 className="text-lg font-semibold text-[var(--text-primary)]">Users & Roles</h2>
          {/* Search bar */}
          <div className="flex items-center gap-2 rounded-xl border border-[var(--border-color)] bg-[var(--bg-input)] px-3 py-2 w-full sm:w-72">
            <Search className="h-4 w-4 text-[var(--text-muted)]" />
            <input
              value={userSearch}
              onChange={(e) => setUserSearch(e.target.value)}
              placeholder="Search by name, email, Discord..."
              className="flex-1 bg-transparent text-sm text-[var(--text-primary)] placeholder:text-[var(--text-muted)] outline-none"
            />
            {userSearch && (
              <button onClick={() => setUserSearch("")} className="text-[var(--text-muted)] hover:text-[var(--text-primary)] cursor-pointer">
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
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

        {filteredUsers.length === 0 ? (
          <EmptyState
            icon={<Users className="h-10 w-10" />}
            title={userSearch ? "No users found" : "No users"}
            description={userSearch ? `No users matching "${userSearch}".` : "Users will appear here after they log in."}
          />
        ) : (
          <div className="space-y-2">
            {filteredUsers.map((user: any) => (
              <div key={user.id} onClick={() => isOwner && router.push(`/admin/users/${user.id}`)}
                className={`rounded-xl border border-[var(--border-color)] p-3 sm:p-4 hover:bg-[var(--bg-card-hover)] transition-colors ${isOwner ? "cursor-pointer" : ""}`}>
                <div className="flex items-center justify-between gap-2 sm:gap-3">
                  <div className="flex items-center gap-2 sm:gap-3 min-w-0">
                    {user.image ? (
                      <img src={user.image} alt="" className="h-9 w-9 rounded-full flex-shrink-0" />
                    ) : (
                      <div className="flex h-9 w-9 items-center justify-center rounded-full bg-accent/10 text-xs font-bold text-accent flex-shrink-0">
                        {(user.username || "?")[0].toUpperCase()}
                      </div>
                    )}
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-[var(--text-primary)] truncate">{user.username || "user"}</p>
                      <p className="text-[11px] text-[var(--text-muted)] truncate">{user.email || "-"}</p>
                    </div>
                  </div>
                  <Badge variant={roleBadge[user.role] as any}>{user.role}</Badge>
                </div>
                <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs">
                  <span className="text-amber-400 font-medium">L{user.level ?? 0}</span>
                  <span className="text-orange-400">🔥{user.currentStreak || 0}d</span>
                  <span className="text-[var(--text-muted)]">{formatCurrency(user.totalEarnings || 0)} earned</span>
                  <span className="text-[var(--text-muted)]">{formatRelative(user.createdAt)}</span>
                  {user.manualBonusOverride != null && <span className="text-blue-400">⚙{user.manualBonusOverride}%</span>}
                </div>
                {isOwner && (
                  <div className="mt-2 flex flex-wrap gap-1" onClick={(e) => e.stopPropagation()}>
                    {roleOptions.map((r) => (
                      <button
                        key={r.value}
                        onClick={() => changeRole(user.id, r.value)}
                        disabled={user.role === r.value || changing === user.id}
                        className={`rounded-lg px-2.5 py-1 text-[11px] font-medium transition-all cursor-pointer ${
                          user.role === r.value
                            ? "bg-accent/10 text-accent border border-accent/20"
                            : "text-[var(--text-secondary)] hover:bg-[var(--bg-input)] border border-[var(--border-color)]"
                        } disabled:opacity-50 disabled:cursor-not-allowed`}
                      >
                        {r.label}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── Create Team Modal ── */}
      <Modal open={showCreateTeam} onClose={() => setShowCreateTeam(false)} title="Create team">
        <div className="space-y-4">
          <Input id="teamName" label="Team name" placeholder="e.g. Agency Alpha" value={newTeamName} onChange={(e) => setNewTeamName(e.target.value)} />
          <div className="flex justify-end gap-3">
            <Button variant="ghost" onClick={() => setShowCreateTeam(false)}>Cancel</Button>
            <Button onClick={createTeam} loading={creatingTeam} disabled={!newTeamName.trim()}>Create Team</Button>
          </div>
        </div>
      </Modal>

      {/* ── Manage Team Modal ── */}
      <Modal open={!!managingTeam} onClose={() => setManagingTeam(null)} title={managingTeam?.name || "Team"} className="max-w-lg">
        {managingTeam && (
          <div className="space-y-5">
            {/* Members */}
            <div>
              <h3 className="text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)] mb-2">Members</h3>
              {managingTeam.members?.length === 0 ? (
                <p className="text-sm text-[var(--text-muted)]">No members yet.</p>
              ) : (
                <div className="space-y-2">
                  {managingTeam.members?.map((m: any) => (
                    <div key={m.userId} className="flex items-center justify-between rounded-xl border border-[var(--border-color)] px-3 py-2">
                      <div className="flex items-center gap-2">
                        {m.user?.image ? (
                          <img src={m.user.image} alt="" className="h-7 w-7 rounded-full" />
                        ) : (
                          <div className="flex h-7 w-7 items-center justify-center rounded-full bg-accent/10 text-[10px] font-bold text-accent">
                            {(m.user?.username || "?")[0].toUpperCase()}
                          </div>
                        )}
                        <div>
                          <p className="text-sm font-medium text-[var(--text-primary)]">{m.user?.username || m.user?.email}</p>
                          <p className="text-[11px] text-[var(--text-muted)]">{m.user?.role} · {m.role}</p>
                        </div>
                      </div>
                      <button onClick={() => removeMember(managingTeam.id, m.userId)}
                        className="rounded-lg p-1.5 text-[var(--text-muted)] hover:text-red-400 hover:bg-red-500/5 transition-colors cursor-pointer">
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
              <div className="mt-3 flex gap-2">
                <Input id="memberEmail" placeholder="Add by email..." value={addMemberEmail} onChange={(e) => setAddMemberEmail(e.target.value)} className="flex-1" />
                <Button size="sm" onClick={addMember} loading={addingMember} disabled={!addMemberEmail.trim()} icon={<UserPlus className="h-3.5 w-3.5" />}>Add</Button>
              </div>
            </div>

            {/* Campaigns */}
            <div>
              <h3 className="text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)] mb-2">Assigned Campaigns</h3>
              {managingTeam.campaigns?.length === 0 ? (
                <p className="text-sm text-[var(--text-muted)]">No campaigns assigned.</p>
              ) : (
                <div className="space-y-1.5">
                  {managingTeam.campaigns?.map((tc: any) => (
                    <div key={tc.campaignId} className="flex items-center justify-between rounded-lg bg-[var(--bg-input)] px-3 py-2">
                      <div className="flex items-center gap-2">
                        <Megaphone className="h-3.5 w-3.5 text-accent" />
                        <span className="text-sm text-[var(--text-primary)]">{tc.campaign?.name || "Campaign"}</span>
                      </div>
                      <Badge variant={(tc.campaign?.status || "active").toLowerCase() as any}>{tc.campaign?.status}</Badge>
                    </div>
                  ))}
                </div>
              )}
              <div className="mt-3 flex gap-2">
                <Select id="assignCampaign" placeholder="Select campaign..."
                  options={campaigns
                    .filter((c: any) => !managingTeam.campaigns?.some((tc: any) => tc.campaignId === c.id))
                    .map((c: any) => ({ value: c.id, label: c.name }))}
                  value={assignCampaignId}
                  onChange={(e) => setAssignCampaignId(e.target.value)}
                  className="flex-1"
                />
                <Button size="sm" onClick={assignCampaign} loading={assigningCampaign} disabled={!assignCampaignId} icon={<Plus className="h-3.5 w-3.5" />}>Assign</Button>
              </div>
            </div>

            {/* Danger zone */}
            <div className="border-t border-[var(--border-subtle)] pt-4">
              <Button size="sm" variant="danger" onClick={() => { if (confirm(`Delete team "${managingTeam.name}"?`)) deleteTeam(managingTeam.id); }}
                icon={<Trash2 className="h-3.5 w-3.5" />}>
                Delete Team
              </Button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
