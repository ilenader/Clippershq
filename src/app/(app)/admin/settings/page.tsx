"use client";

import { useEffect, useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Crown, Plus, Trash2, Users, Star, Flame, Zap, BarChart3 } from "lucide-react";
import { toast } from "@/lib/toast";

interface LeaderboardEntry {
  name: string;
  earnings: number;
  views: number;
}

export default function AdminSettingsPage() {
  // ── Leaderboard ──
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);
  const [lbLoading, setLbLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // ── Gamification overview ──
  const [users, setUsers] = useState<any[]>([]);

  useEffect(() => {
    // Fetch leaderboard
    fetch("/api/gamification?leaderboard=true")
      .then((r) => r.json())
      .then((data) => { if (Array.isArray(data)) setLeaderboard(data); })
      .catch(() => {})
      .finally(() => setLbLoading(false));

    // Fetch all users for overview
    fetch("/api/admin/users")
      .then((r) => r.json())
      .then((data) => { if (Array.isArray(data)) setUsers(data); })
      .catch(() => {});
  }, []);

  // ── Leaderboard CRUD ──
  const addEntry = () => {
    setLeaderboard([...leaderboard, { name: "", earnings: 0, views: 0 }]);
  };

  const updateEntry = (idx: number, field: keyof LeaderboardEntry, value: string) => {
    const updated = [...leaderboard];
    if (field === "name") updated[idx].name = value;
    else updated[idx][field] = parseFloat(value) || 0;
    setLeaderboard(updated);
  };

  const removeEntry = (idx: number) => {
    setLeaderboard(leaderboard.filter((_, i) => i !== idx));
  };

  const saveLeaderboard = async () => {
    setSaving(true);
    try {
      const sorted = [...leaderboard]
        .filter((e) => e.name.trim())
        .sort((a, b) => b.earnings - a.earnings || b.views - a.views);
      const res = await fetch("/api/gamification", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key: "leaderboard", value: sorted }),
      });
      if (!res.ok) throw new Error("Failed");
      setLeaderboard(sorted);
      toast.success("Leaderboard saved.");
    } catch {
      toast.error("Failed to save leaderboard.");
    }
    setSaving(false);
  };

  // ── Compute overview stats ──
  const levelCounts: Record<number, number> = { 0: 0, 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
  const feeBuckets: Record<string, number> = { "9% (standard)": 0, "4% (referred)": 0 };
  const streakByDay: Record<number, number> = {};

  for (const u of users) {
    // Level distribution
    const lvl = u.level || 0;
    levelCounts[lvl] = (levelCounts[lvl] || 0) + 1;

    // Fee distribution: 9% normal, 4% referred
    if (u.referredById) feeBuckets["4% (referred)"]++;
    else feeBuckets["9% (standard)"]++;

    // Streak distribution
    const streak = u.currentStreak || 0;
    const dayKey = streak >= 60 ? 60 : streak;
    streakByDay[dayKey] = (streakByDay[dayKey] || 0) + 1;
  }

  // Build streak rows: always show 0-7, then only days with users, 60 = "60+"
  const streakRows: { label: string; count: number }[] = [];
  for (let d = 0; d <= 7; d++) {
    streakRows.push({ label: d === 0 ? "0" : String(d), count: streakByDay[d] || 0 });
  }
  for (let d = 8; d < 60; d++) {
    if (streakByDay[d]) streakRows.push({ label: String(d), count: streakByDay[d] });
  }
  if (streakByDay[60]) streakRows.push({ label: "60+", count: streakByDay[60] });

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-[var(--text-primary)]">Gamification Control</h1>
        <p className="text-[15px] text-[var(--text-secondary)]">User distribution, leaderboard management, and system overview.</p>
      </div>

      {/* ══════════════════════════════════════════════════
          SECTION 1: GAMIFICATION OVERVIEW
         ══════════════════════════════════════════════════ */}
      <div className="space-y-4">
        <h2 className="text-lg font-semibold text-[var(--text-primary)] flex items-center gap-2">
          <BarChart3 className="h-5 w-5 text-accent" /> Gamification Overview
        </h2>
        <div className="grid gap-4 sm:grid-cols-3">
          {/* Users by level */}
          <Card>
            <div className="flex items-center gap-2 mb-3">
              <Star className="h-4 w-4 text-accent" />
              <p className="text-sm font-semibold text-[var(--text-primary)]">Users by Level</p>
            </div>
            <div className="space-y-1.5">
              {Object.entries(levelCounts).map(([lvl, count]) => (
                <div key={lvl} className="flex items-center justify-between">
                  <span className="text-sm text-[var(--text-secondary)]">Level {lvl}</span>
                  <div className="flex items-center gap-2">
                    <div className="w-20 h-2 rounded-full bg-[var(--bg-input)]">
                      <div className="h-full rounded-full bg-accent" style={{ width: `${users.length ? (count / users.length) * 100 : 0}%` }} />
                    </div>
                    <span className="text-sm font-medium text-[var(--text-primary)] w-8 text-right">{count}</span>
                  </div>
                </div>
              ))}
            </div>
            <p className="text-xs text-[var(--text-muted)] mt-2">{users.length} total users</p>
          </Card>

          {/* Users by payout fee */}
          <Card>
            <div className="flex items-center gap-2 mb-3">
              <Zap className="h-4 w-4 text-accent" />
              <p className="text-sm font-semibold text-[var(--text-primary)]">Users by Payout Fee</p>
            </div>
            <p className="text-xs text-[var(--text-muted)] mb-2">Fixed fees: 9% standard, 4% referred users. No streak-based reduction.</p>
            <div className="space-y-1.5">
              {Object.entries(feeBuckets).map(([fee, count]) => (
                <div key={fee} className="flex items-center justify-between">
                  <span className="text-sm text-[var(--text-secondary)]">{fee}</span>
                  <div className="flex items-center gap-2">
                    <div className="w-20 h-2 rounded-full bg-[var(--bg-input)]">
                      <div className="h-full rounded-full bg-accent" style={{ width: `${users.length ? (count / users.length) * 100 : 0}%` }} />
                    </div>
                    <span className="text-sm font-medium text-[var(--text-primary)] w-8 text-right">{count}</span>
                  </div>
                </div>
              ))}
            </div>
          </Card>

          {/* Users by streak — individual days */}
          <Card>
            <div className="flex items-center gap-2 mb-3">
              <Flame className="h-4 w-4 text-accent" />
              <p className="text-sm font-semibold text-[var(--text-primary)]">Users by Streak</p>
            </div>
            <div className="space-y-1 max-h-64 overflow-y-auto pr-1">
              {streakRows.map((row) => (
                <div key={row.label} className="flex items-center justify-between">
                  <span className="text-xs text-[var(--text-secondary)] w-10">{row.label}d</span>
                  <div className="flex items-center gap-2 flex-1 ml-2">
                    <div className="flex-1 h-2 rounded-full bg-[var(--bg-input)]">
                      <div className="h-full rounded-full bg-accent" style={{ width: `${users.length ? (row.count / users.length) * 100 : 0}%` }} />
                    </div>
                    <span className="text-xs font-medium text-[var(--text-primary)] w-6 text-right tabular-nums">{row.count}</span>
                  </div>
                </div>
              ))}
            </div>
          </Card>
        </div>
      </div>

      {/* ══════════════════════════════════════════════════
          SECTION 2: MONTHLY LEADERBOARD EDITOR
         ══════════════════════════════════════════════════ */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-[var(--text-primary)] flex items-center gap-2">
            <Crown className="h-5 w-5 text-accent" /> Monthly Leaderboard
          </h2>
          <div className="flex gap-2">
            <Button size="sm" variant="outline" onClick={addEntry} icon={<Plus className="h-3.5 w-3.5" />}>Add Entry</Button>
            <Button size="sm" onClick={saveLeaderboard} loading={saving}>Save</Button>
          </div>
        </div>

        {lbLoading ? (
          <div className="flex justify-center py-8">
            <div className="h-6 w-6 animate-spin rounded-full border-2 border-[var(--border-color)] border-t-accent" />
          </div>
        ) : leaderboard.length === 0 ? (
          <Card>
            <div className="py-4 text-center">
              <Crown className="h-8 w-8 mx-auto text-[var(--text-muted)] mb-2 opacity-40" />
              <p className="text-sm text-[var(--text-muted)]">No leaderboard entries yet. Add entries to motivate clippers.</p>
            </div>
          </Card>
        ) : (
          <div className="space-y-2">
            {leaderboard.map((entry, idx) => (
              <div key={idx} className="flex items-center gap-3 rounded-xl border border-[var(--border-color)] bg-[var(--bg-card)] px-4 py-3">
                <span className={`text-lg font-bold w-6 text-center ${idx === 0 ? "text-amber-400" : idx === 1 ? "text-[var(--text-secondary)]" : idx === 2 ? "text-orange-700" : "text-[var(--text-muted)]"}`}>
                  {idx + 1}
                </span>
                <Input
                  id={`lb-name-${idx}`}
                  placeholder="Display name"
                  value={entry.name}
                  onChange={(e) => updateEntry(idx, "name", e.target.value)}
                  className="flex-1"
                />
                <Input
                  id={`lb-earnings-${idx}`}
                  placeholder="Earnings"
                  type="number"
                  step="0.01"
                  value={entry.earnings || ""}
                  onChange={(e) => updateEntry(idx, "earnings", e.target.value)}
                  className="w-28"
                />
                <Input
                  id={`lb-views-${idx}`}
                  placeholder="Views"
                  type="number"
                  value={entry.views || ""}
                  onChange={(e) => updateEntry(idx, "views", e.target.value)}
                  className="w-28"
                />
                <button onClick={() => removeEntry(idx)}
                  className="rounded-lg p-2 text-[var(--text-muted)] hover:text-red-400 hover:bg-red-500/5 transition-colors cursor-pointer">
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            ))}
          </div>
        )}
        <p className="text-xs text-[var(--text-muted)]">Entries are auto-sorted by earnings (highest first), then views. Only entries with a name are saved.</p>
      </div>
    </div>
  );
}
