"use client";

import { Card } from "@/components/ui/card";
import { DollarSign } from "lucide-react";
import { formatCurrency } from "@/lib/utils";
import { type EarningsData } from "@/lib/earnings";

interface EarningsSummaryProps {
  data: EarningsData;
  /** Show the "Available for payout" highlight card (default true) */
  showAvailable?: boolean;
}

export function EarningsSummary({ data, showAvailable = true }: EarningsSummaryProps) {
  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        {[
          { label: "Total earned", value: formatCurrency(data.totalEarned), color: "text-[var(--text-primary)]" },
          { label: "Approved", value: formatCurrency(data.approvedEarnings), color: "text-emerald-400" },
          { label: "Pending review", value: formatCurrency(data.pendingEarnings), color: "text-yellow-400" },
          { label: "In payout queue", value: formatCurrency(data.lockedInPayouts), color: "text-orange-400" },
          { label: "Paid out", value: formatCurrency(data.paidOut), color: "text-accent" },
        ].map((item) => (
          <Card key={item.label}>
            <p className="text-xs font-medium uppercase tracking-wider text-[var(--text-muted)]">{item.label}</p>
            <p className={`mt-2 text-2xl font-bold ${item.color}`}>{item.value}</p>
          </Card>
        ))}
      </div>

      {showAvailable && (
        <Card className="border-accent/20">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-medium uppercase tracking-wider text-[var(--text-muted)]">Available for payout</p>
              <p className="mt-1 text-3xl font-bold text-accent">{formatCurrency(data.available)}</p>
            </div>
            <DollarSign className="h-8 w-8 text-accent/30" />
          </div>
        </Card>
      )}
    </div>
  );
}
