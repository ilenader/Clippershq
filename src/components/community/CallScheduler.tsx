"use client";

import { useState } from "react";
import { CalendarPlus, X } from "lucide-react";
import { toast } from "@/lib/toast";

interface Props {
  campaignId?: string;
  onScheduled?: () => void;
}

export function CallScheduler({ campaignId, onScheduled }: Props) {
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [date, setDate] = useState("");
  const [time, setTime] = useState("");
  const [duration, setDuration] = useState(60);
  const [isGlobal, setIsGlobal] = useState(false);
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    if (!title.trim() || !date || !time) {
      toast.error("Title, date, and time are required");
      return;
    }
    const scheduledAt = new Date(`${date}T${time}`);
    if (isNaN(scheduledAt.getTime()) || scheduledAt.getTime() < Date.now()) {
      toast.error("Scheduled time must be in the future");
      return;
    }
    setSaving(true);
    try {
      const res = await fetch("/api/community/calls", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          campaignId: isGlobal ? null : campaignId,
          title: title.trim(),
          description: description.trim() || undefined,
          scheduledAt: scheduledAt.toISOString(),
          duration,
          isGlobal,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to schedule");
      toast.success("Call scheduled");
      setOpen(false);
      setTitle(""); setDescription(""); setDate(""); setTime(""); setDuration(60); setIsGlobal(false);
      onScheduled?.();
    } catch (err: any) {
      toast.error(err.message || "Failed to schedule");
    }
    setSaving(false);
  };

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="flex items-center gap-2 px-3 py-2 rounded-xl bg-accent text-white text-xs lg:text-sm font-semibold hover:bg-accent/85 transition-colors"
      >
        <CalendarPlus className="h-4 w-4" />
        Schedule Call
      </button>

      {open && (
        <div className="fixed inset-0 z-[80] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-2xl border border-[var(--border-color)] bg-[var(--bg-card)] shadow-2xl">
            <div className="flex items-center justify-between px-5 py-4 border-b border-[var(--border-color)]">
              <h3 className="text-base lg:text-lg font-semibold text-[var(--text-primary)]">Schedule a voice call</h3>
              <button onClick={() => setOpen(false)} className="h-7 w-7 rounded-lg flex items-center justify-center hover:bg-[var(--bg-input)] transition-colors">
                <X className="h-4 w-4 text-[var(--text-muted)]" />
              </button>
            </div>

            <div className="p-5 space-y-4">
              <Field label="Title">
                <input
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value.slice(0, 200))}
                  placeholder="Weekly standup"
                  className="w-full rounded-xl border border-[var(--border-color)] bg-[var(--bg-input)] px-3 py-2 text-sm text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:border-accent/40 focus:outline-none transition-colors"
                />
              </Field>

              <Field label="Description (optional)">
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value.slice(0, 5000))}
                  rows={3}
                  placeholder="What will be covered?"
                  className="w-full rounded-xl border border-[var(--border-color)] bg-[var(--bg-input)] px-3 py-2 text-sm text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:border-accent/40 focus:outline-none transition-colors resize-y"
                />
              </Field>

              <div className="grid grid-cols-2 gap-3">
                <Field label="Date">
                  <input
                    type="date"
                    value={date}
                    onChange={(e) => setDate(e.target.value)}
                    min={new Date().toISOString().split("T")[0]}
                    className="w-full rounded-xl border border-[var(--border-color)] bg-[var(--bg-input)] px-3 py-2 text-sm text-[var(--text-primary)] focus:border-accent/40 focus:outline-none transition-colors"
                  />
                </Field>
                <Field label="Time">
                  <input
                    type="time"
                    value={time}
                    onChange={(e) => setTime(e.target.value)}
                    className="w-full rounded-xl border border-[var(--border-color)] bg-[var(--bg-input)] px-3 py-2 text-sm text-[var(--text-primary)] focus:border-accent/40 focus:outline-none transition-colors"
                  />
                </Field>
              </div>

              <Field label="Duration">
                <div className="grid grid-cols-3 gap-2">
                  {[30, 60, 120].map((mins) => (
                    <button
                      key={mins}
                      onClick={() => setDuration(mins)}
                      className={`py-2 rounded-xl text-sm font-medium transition-colors ${
                        duration === mins
                          ? "bg-accent/15 text-accent border border-accent/30"
                          : "bg-[var(--bg-input)] text-[var(--text-muted)] hover:text-[var(--text-primary)] border border-[var(--border-color)]"
                      }`}
                    >
                      {mins === 60 ? "1 hr" : mins === 120 ? "2 hr" : `${mins} min`}
                    </button>
                  ))}
                </div>
              </Field>

              {campaignId && (
                <label className="flex items-center gap-2 cursor-pointer text-sm text-[var(--text-secondary)]">
                  <input
                    type="checkbox"
                    checked={isGlobal}
                    onChange={(e) => setIsGlobal(e.target.checked)}
                    className="h-4 w-4 rounded border-[var(--border-color)] accent-accent"
                  />
                  Broadcast to ALL clippers (not just this campaign)
                </label>
              )}
            </div>

            <div className="flex justify-end gap-2 px-5 py-4 border-t border-[var(--border-color)]">
              <button
                onClick={() => setOpen(false)}
                className="px-4 py-2 rounded-xl text-sm text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-input)] transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={submit}
                disabled={saving}
                className="px-4 py-2 rounded-xl bg-accent text-white text-sm font-semibold hover:bg-accent/85 transition-colors disabled:opacity-50"
              >
                {saving ? "Scheduling…" : "Schedule"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="text-[11px] font-semibold uppercase tracking-wider text-[var(--text-muted)] mb-1.5">{label}</p>
      {children}
    </div>
  );
}
