"use client";

import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Settings } from "lucide-react";

export default function AdminSettingsPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-[var(--text-primary)]">Settings</h1>
        <p className="text-sm text-[var(--text-secondary)]">System configuration. Owner access only.</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Card>
          <p className="text-sm font-semibold text-[var(--text-primary)]">Global Blacklist</p>
          <p className="text-xs text-[var(--text-muted)] mt-1">Manage banned users and wallets.</p>
          <p className="mt-3 text-xs text-[var(--text-muted)] italic">Coming in Phase 2</p>
        </Card>
        <Card>
          <p className="text-sm font-semibold text-[var(--text-primary)]">Fraud Thresholds</p>
          <p className="text-xs text-[var(--text-muted)] mt-1">Configure fraud detection rules and trust score weights.</p>
          <p className="mt-3 text-xs text-[var(--text-muted)] italic">Coming in Phase 2</p>
        </Card>
        <Card>
          <p className="text-sm font-semibold text-[var(--text-primary)]">Payout Rules</p>
          <p className="text-xs text-[var(--text-muted)] mt-1">Set minimum payout, verification requirements, and limits.</p>
          <p className="mt-3 text-xs text-[var(--text-muted)] italic">Coming in Phase 2</p>
        </Card>
        <Card>
          <p className="text-sm font-semibold text-[var(--text-primary)]">Tracking Configuration</p>
          <p className="text-xs text-[var(--text-muted)] mt-1">Configure stat checking intervals and archive rules.</p>
          <p className="mt-3 text-xs text-[var(--text-muted)] italic">Coming in Phase 2</p>
        </Card>
      </div>

      <EmptyState
        icon={<Settings className="h-10 w-10" />}
        title="Settings coming in Phase 2"
        description="System configuration, blacklists, fraud rules, and advanced controls will be available here."
      />
    </div>
  );
}
