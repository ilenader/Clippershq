"use client";

import { useState } from "react";
import { Modal } from "@/components/ui/modal";
import { Hash, Lock, Megaphone } from "lucide-react";
import { toast } from "@/lib/toast";

type NewChannelType = "general" | "announcement" | "private";

interface Props {
  campaignId: string;
  open: boolean;
  onClose: () => void;
  onCreated: (channel: { id: string; name: string; type: string }) => void;
}

/**
 * Owner-only modal for creating additional channels. Defaults (general /
 * announcement / leaderboard) are auto-provisioned by `ensureCampaignChannels`
 * on first visit — this form creates EXTRA channels beyond that set.
 */
export function AddChannelModal({ campaignId, open, onClose, onCreated }: Props) {
  const [name, setName] = useState("");
  const [type, setType] = useState<NewChannelType>("general");
  const [saving, setSaving] = useState(false);

  const normalize = (s: string) =>
    s.toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "");

  const handleCreate = async () => {
    const cleanName = normalize(name);
    if (!cleanName) {
      toast.error("Channel name cannot be empty");
      return;
    }
    setSaving(true);
    try {
      const res = await fetch("/api/community/channels/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ campaignId, name: cleanName, type }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "Failed to create channel");
      toast.success("Channel created");
      onCreated(data);
      setName("");
      setType("general");
      onClose();
    } catch (err: any) {
      toast.error(err?.message || "Failed to create channel");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal open={open} onClose={onClose} title="Create Channel">
      <div className="space-y-5">
        {/* Name */}
        <div>
          <label className="block text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)] mb-1.5">
            Channel name
          </label>
          <div className="relative">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-muted)] font-medium">
              #
            </span>
            <input
              type="text"
              placeholder="new-channel"
              value={name}
              onChange={(e) => setName(normalize(e.target.value))}
              maxLength={50}
              className="w-full pl-7 pr-4 py-3 rounded-xl border border-[var(--border-color)] bg-[var(--bg-input)] text-sm text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:border-accent/40 focus:outline-none transition-colors"
            />
          </div>
          <p className="mt-1.5 text-[11px] text-[var(--text-muted)]">
            Lowercase letters, numbers, and hyphens only.
          </p>
        </div>

        {/* Type */}
        <div className="space-y-2">
          <p className="text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)]">
            Channel type
          </p>

          <TypeOption
            id="general"
            selected={type}
            onSelect={setType}
            icon={Hash}
            title="Public channel"
            desc="Everyone in the campaign can read and post."
          />
          <TypeOption
            id="announcement"
            selected={type}
            onSelect={setType}
            icon={Megaphone}
            title="Announcement channel"
            desc="Everyone reads. Only owners and admins post."
          />
          <TypeOption
            id="private"
            selected={type}
            onSelect={setType}
            icon={Lock}
            title="Private channel"
            desc="Hidden from clippers. Only owners and admins see and post."
          />
        </div>

        <div className="flex justify-end gap-2 pt-2">
          <button
            onClick={onClose}
            disabled={saving}
            className="px-4 py-2 rounded-xl text-sm text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-input)] transition-colors disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            onClick={handleCreate}
            disabled={saving || !name.trim()}
            className="px-4 py-2 rounded-xl bg-accent text-white text-sm font-semibold hover:bg-accent/85 transition-colors disabled:opacity-50"
          >
            {saving ? "Creating…" : "Create channel"}
          </button>
        </div>
      </div>
    </Modal>
  );
}

function TypeOption({
  id,
  selected,
  onSelect,
  icon: Icon,
  title,
  desc,
}: {
  id: NewChannelType;
  selected: NewChannelType;
  onSelect: (t: NewChannelType) => void;
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  desc: string;
}) {
  const active = selected === id;
  return (
    <label
      className={`flex items-start gap-3 p-3 rounded-xl border cursor-pointer transition-colors ${
        active
          ? "border-accent/40 bg-accent/5"
          : "border-[var(--border-color)] hover:border-[var(--border-color)] hover:bg-[var(--bg-card-hover)]"
      }`}
    >
      <input
        type="radio"
        name="channel-type"
        value={id}
        checked={active}
        onChange={() => onSelect(id)}
        className="mt-1 accent-accent"
      />
      <Icon className={`h-4 w-4 mt-1 flex-shrink-0 ${active ? "text-accent" : "text-[var(--text-muted)]"}`} />
      <div className="min-w-0">
        <p className="text-sm font-medium text-[var(--text-primary)]">{title}</p>
        <p className="text-xs text-[var(--text-muted)] leading-relaxed">{desc}</p>
      </div>
    </label>
  );
}
