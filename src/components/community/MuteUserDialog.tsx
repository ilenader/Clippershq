"use client";

import { useState } from "react";
import { VolumeX, X } from "lucide-react";
import { toast } from "@/lib/toast";

interface Props {
  open: boolean;
  onClose: () => void;
  campaignId: string;
  target: { userId: string; username: string } | null;
}

const DURATIONS: { minutes: number; label: string }[] = [
  { minutes: 5,    label: "5 min" },
  { minutes: 15,   label: "15 min" },
  { minutes: 30,   label: "30 min" },
  { minutes: 60,   label: "1 hour" },
  { minutes: 120,  label: "2 hours" },
  { minutes: 300,  label: "5 hours" },
  { minutes: 480,  label: "8 hours" },
  { minutes: 720,  label: "12 hours" },
  { minutes: 1440, label: "24 hours" },
];

export function MuteUserDialog({ open, onClose, campaignId, target }: Props) {
  const [duration, setDuration] = useState<number>(15);
  const [reason, setReason] = useState("");
  const [submitting, setSubmitting] = useState(false);

  if (!open || !target) return null;

  const submit = async () => {
    setSubmitting(true);
    try {
      const res = await fetch("/api/community/mutes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          campaignId,
          userId: target.userId,
          durationMinutes: duration,
          reason: reason.trim() || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "Could not mute user");
      const label = DURATIONS.find((d) => d.minutes === duration)?.label || `${duration} min`;
      toast.success(`Muted ${target.username} for ${label}`);
      setReason("");
      setDuration(15);
      onClose();
    } catch (err: any) {
      toast.error(err?.message || "Could not mute user");
    }
    setSubmitting(false);
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center px-4" onClick={onClose}>
      <div className="absolute inset-0 bg-black/60" />
      <div
        className="relative w-full max-w-md rounded-2xl border border-[var(--border-color)] bg-[var(--bg-card)] p-5 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between mb-3">
          <div className="flex items-center gap-2">
            <div className="h-9 w-9 rounded-xl bg-amber-500/10 flex items-center justify-center">
              <VolumeX className="h-5 w-5 text-amber-400" />
            </div>
            <div>
              <h3 className="text-base font-semibold text-[var(--text-primary)]">Mute user</h3>
              <p className="text-xs text-[var(--text-muted)]">
                <span className="font-semibold text-[var(--text-primary)]">{target.username}</span> won't be able to post in channels until the mute expires.
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="h-7 w-7 rounded-lg flex items-center justify-center hover:bg-[var(--bg-card-hover)] transition-colors flex-shrink-0"
            aria-label="Close"
          >
            <X className="h-4 w-4 text-[var(--text-muted)]" />
          </button>
        </div>

        <p className="text-xs uppercase tracking-widest text-[var(--text-muted)] mb-2">Duration</p>
        <div className="grid grid-cols-3 gap-2 mb-4">
          {DURATIONS.map((d) => (
            <button
              key={d.minutes}
              onClick={() => setDuration(d.minutes)}
              className={`rounded-lg py-2 text-xs font-semibold transition-colors ${
                duration === d.minutes
                  ? "bg-accent text-white"
                  : "bg-[var(--bg-input)] text-[var(--text-secondary)] hover:bg-[var(--bg-card-hover)] hover:text-[var(--text-primary)]"
              }`}
            >
              {d.label}
            </button>
          ))}
        </div>

        <p className="text-xs uppercase tracking-widest text-[var(--text-muted)] mb-2">Reason (optional)</p>
        <textarea
          value={reason}
          onChange={(e) => setReason(e.target.value.slice(0, 200))}
          placeholder="Internal note — not shown to the user."
          rows={2}
          className="w-full resize-none rounded-xl border border-[var(--border-color)] bg-[var(--bg-input)] px-3 py-2 text-sm text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:border-accent/40 focus:outline-none transition-colors mb-4"
        />

        <div className="flex justify-end gap-2">
          <button
            onClick={onClose}
            disabled={submitting}
            className="px-4 py-2 rounded-lg text-sm font-medium text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-card-hover)] transition-colors disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            onClick={submit}
            disabled={submitting}
            className="px-4 py-2 rounded-lg bg-amber-500 text-white text-sm font-semibold hover:bg-amber-500/85 active:scale-[0.98] transition-all disabled:opacity-50"
          >
            {submitting ? "Muting…" : "Mute user"}
          </button>
        </div>
      </div>
    </div>
  );
}
