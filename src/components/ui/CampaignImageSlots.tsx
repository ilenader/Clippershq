"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Cropper from "react-easy-crop";
import type { Area } from "react-easy-crop";
import { Upload, Image as ImageIcon, X, RotateCcw } from "lucide-react";
import { toast } from "@/lib/toast";

/**
 * Three-slot campaign image uploader with browser cropping.
 *
 * Each slot has a fixed aspect ratio + output dimensions. Users pick a file,
 * a modal opens with react-easy-crop locked to the correct ratio, they drag
 * to reposition / pinch-or-scroll to zoom, and the cropped result is uploaded
 * to /api/upload. Fallback compression to 85% JPEG if the cropped blob still
 * exceeds the slot's max size (huge source images sometimes produce >2 MB
 * crops even after resize).
 */

// ─── Slot definitions ──────────────────────────────────────

type SlotKey = "card" | "banner" | "avatar";

interface Slot {
  key: SlotKey;
  label: string;
  purpose: string;
  aspect: number;        // width / height
  outputW: number;
  outputH: number;
  maxBytes: number;
  /** Visual preview shape. "square" and "wide" use aspect-ratio; "circle"
   *  is a square with border-radius full. */
  previewShape: "square" | "wide" | "circle";
}

const SLOTS: Slot[] = [
  { key: "card",   label: "Card image",        purpose: "Shown on campaigns list",  aspect: 1,        outputW: 800,  outputH: 800, maxBytes: 2 * 1024 * 1024, previewShape: "square" },
  { key: "banner", label: "Banner image",      purpose: "Top of campaign page",     aspect: 16 / 5,   outputW: 1920, outputH: 600, maxBytes: 3 * 1024 * 1024, previewShape: "wide" },
  { key: "avatar", label: "Community avatar",  purpose: "Community sidebar icon",   aspect: 1,        outputW: 256,  outputH: 256, maxBytes: 1 * 1024 * 1024, previewShape: "circle" },
];

const ACCEPTED_TYPES = ["image/jpeg", "image/png", "image/webp"];

// ─── Public API ────────────────────────────────────────────

export interface CampaignImageUrls {
  cardImageUrl: string | null;
  bannerImageUrl: string | null;
  communityAvatarUrl: string | null;
}

interface Props {
  value: CampaignImageUrls;
  onChange: (next: CampaignImageUrls) => void;
}

export function CampaignImageSlots({ value, onChange }: Props) {
  const [activeSlot, setActiveSlot] = useState<Slot | null>(null);
  const [srcDataUrl, setSrcDataUrl] = useState<string | null>(null);

  const urlFor = (k: SlotKey): string | null =>
    k === "card" ? value.cardImageUrl
    : k === "banner" ? value.bannerImageUrl
    : value.communityAvatarUrl;

  const setUrlFor = (k: SlotKey, url: string | null) => {
    const next: CampaignImageUrls = { ...value };
    if (k === "card") next.cardImageUrl = url;
    if (k === "banner") next.bannerImageUrl = url;
    if (k === "avatar") next.communityAvatarUrl = url;
    onChange(next);
  };

  const openCropForFile = (slot: Slot, file: File) => {
    if (!ACCEPTED_TYPES.includes(file.type)) {
      toast.error("Please choose a JPG, PNG, or WebP image.");
      return;
    }
    if (file.size > slot.maxBytes) {
      toast.error(`File too large. Max ${(slot.maxBytes / 1024 / 1024).toFixed(0)} MB for ${slot.label.toLowerCase()}.`);
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      setSrcDataUrl(reader.result as string);
      setActiveSlot(slot);
    };
    reader.readAsDataURL(file);
  };

  const handleCropped = (url: string) => {
    if (activeSlot) setUrlFor(activeSlot.key, url);
    setActiveSlot(null);
    setSrcDataUrl(null);
  };

  const handleCropCancel = () => {
    setActiveSlot(null);
    setSrcDataUrl(null);
  };

  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-sm font-semibold text-[var(--text-primary)]">Campaign images</h3>
        <p className="text-xs text-[var(--text-muted)] mt-0.5">
          Upload one image per slot. We'll help you crop it to the right size.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {SLOTS.map((slot) => (
          <SlotCard
            key={slot.key}
            slot={slot}
            currentUrl={urlFor(slot.key)}
            onPickFile={(file) => openCropForFile(slot, file)}
            onReplace={() => {
              // Trigger the hidden input on the slot card. Managed inside SlotCard.
            }}
            onRemove={() => setUrlFor(slot.key, null)}
          />
        ))}
      </div>

      {activeSlot && srcDataUrl && (
        <CropModal
          slot={activeSlot}
          srcDataUrl={srcDataUrl}
          onSave={handleCropped}
          onCancel={handleCropCancel}
        />
      )}
    </div>
  );
}

// ─── Single slot card ──────────────────────────────────────

function SlotCard({
  slot, currentUrl, onPickFile, onRemove,
}: {
  slot: Slot;
  currentUrl: string | null;
  onPickFile: (file: File) => void;
  onReplace: () => void;
  onRemove: () => void;
}) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);

  const openPicker = () => fileInputRef.current?.click();

  const previewAspectClass =
    slot.previewShape === "square" ? "aspect-square"
    : slot.previewShape === "wide" ? "aspect-[16/5]"
    : "aspect-square";

  const previewRadiusClass = slot.previewShape === "circle" ? "rounded-full" : "rounded-lg";

  return (
    <div className="rounded-xl border border-[var(--border-color)] bg-[var(--bg-card)] p-4 flex flex-col">
      <div className="flex items-start justify-between gap-2 mb-1">
        <div>
          <p className="text-sm font-medium text-[var(--text-primary)]">{slot.label}</p>
          <p className="text-xs text-[var(--text-muted)]">{slot.purpose}</p>
        </div>
        <ImageIcon className="h-4 w-4 text-accent flex-shrink-0" />
      </div>

      <div
        onClick={!currentUrl ? openPicker : undefined}
        onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragOver(false);
          const file = e.dataTransfer.files?.[0];
          if (file) onPickFile(file);
        }}
        className={`mt-3 relative w-full ${previewAspectClass} ${previewRadiusClass} overflow-hidden border-2 ${
          currentUrl
            ? "border-[var(--border-color)]"
            : `border-dashed ${dragOver ? "border-accent bg-accent/5" : "border-[var(--border-color)] hover:border-accent/60 hover:bg-[var(--bg-card-hover)]"} cursor-pointer transition-colors flex items-center justify-center`
        }`}
      >
        {currentUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={currentUrl} alt="" className="w-full h-full object-cover" />
        ) : (
          <div className="flex flex-col items-center gap-1.5 px-3 text-center pointer-events-none">
            <Upload className="h-5 w-5 text-accent" />
            <span className="text-xs font-medium text-[var(--text-secondary)]">Click or drop to upload</span>
          </div>
        )}
      </div>

      <div className="mt-2 flex items-center justify-between gap-2">
        <p className="text-[10px] text-[var(--text-muted)]">
          JPG, PNG, WebP · max {(slot.maxBytes / 1024 / 1024).toFixed(0)}MB · {slot.outputW}×{slot.outputH}
        </p>
        {currentUrl && (
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={openPicker}
              className="flex items-center gap-1 rounded-md px-2 py-1 text-[11px] text-[var(--text-secondary)] hover:bg-[var(--bg-card-hover)] hover:text-accent transition-colors"
            >
              <RotateCcw className="h-3 w-3" />
              Replace
            </button>
            <button
              type="button"
              onClick={onRemove}
              className="flex items-center gap-1 rounded-md px-2 py-1 text-[11px] text-[var(--text-muted)] hover:bg-red-500/10 hover:text-red-400 transition-colors"
            >
              <X className="h-3 w-3" />
              Remove
            </button>
          </div>
        )}
      </div>

      <input
        ref={fileInputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) onPickFile(file);
          // Reset value so the same file can be re-picked after a cancel.
          e.target.value = "";
        }}
      />
    </div>
  );
}

// ─── Crop modal ────────────────────────────────────────────

function CropModal({
  slot, srcDataUrl, onSave, onCancel,
}: {
  slot: Slot;
  srcDataUrl: string;
  onSave: (url: string) => void;
  onCancel: () => void;
}) {
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [croppedArea, setCroppedArea] = useState<Area | null>(null);
  const [saving, setSaving] = useState(false);

  // Esc to close + focus trap basics.
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !saving) onCancel();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onCancel, saving]);

  const onCropComplete = useCallback((_: Area, pixels: Area) => {
    setCroppedArea(pixels);
  }, []);

  const handleSave = async () => {
    if (!croppedArea || saving) return;
    setSaving(true);
    try {
      const blob = await renderCroppedBlob(srcDataUrl, croppedArea, slot);
      const url = await uploadBlob(blob, slot.key);
      onSave(url);
    } catch (err: any) {
      console.error("[CROP] failed:", err);
      toast.error(err?.message || "Couldn't save crop. Try again.");
      setSaving(false);
    }
  };

  const adjustTitle =
    slot.key === "card" ? "Adjust your Card image"
    : slot.key === "banner" ? "Adjust your Banner image"
    : "Adjust your Avatar image";

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-md"
      onClick={(e) => { if (e.target === e.currentTarget && !saving) onCancel(); }}
      role="dialog"
      aria-modal="true"
      aria-label={adjustTitle}
    >
      <div className="relative w-full max-w-3xl rounded-2xl bg-[var(--bg-card)] border border-[var(--border-color)] shadow-xl flex flex-col overflow-hidden">
        <div className="flex items-center justify-between px-5 py-3 border-b border-[var(--border-color)]">
          <h3 className="text-sm font-semibold text-[var(--text-primary)]">{adjustTitle}</h3>
          <button
            type="button"
            onClick={onCancel}
            disabled={saving}
            className="rounded-lg p-1.5 text-[var(--text-muted)] hover:bg-[var(--bg-card-hover)] hover:text-[var(--text-primary)] disabled:opacity-40"
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="relative w-full" style={{ height: 420, background: "#0a0a0a" }}>
          <Cropper
            image={srcDataUrl}
            crop={crop}
            zoom={zoom}
            aspect={slot.aspect}
            onCropChange={setCrop}
            onZoomChange={setZoom}
            onCropComplete={onCropComplete}
            showGrid={false}
            cropShape={slot.previewShape === "circle" ? "round" : "rect"}
            objectFit="contain"
          />
        </div>

        <div className="px-5 py-4 space-y-3 border-t border-[var(--border-color)]">
          <div>
            <label className="block text-xs uppercase tracking-widest text-[var(--text-muted)] mb-1.5">Zoom</label>
            <input
              type="range"
              min={1}
              max={3}
              step={0.01}
              value={zoom}
              onChange={(e) => setZoom(parseFloat(e.target.value))}
              className="w-full accent-accent"
              aria-label="Zoom"
            />
          </div>
          <p className="text-xs text-[var(--text-muted)]">
            Drag to reposition, pinch or scroll to zoom.
          </p>

          <div className="flex items-center justify-end gap-2 pt-1">
            <button
              type="button"
              onClick={onCancel}
              disabled={saving}
              className="rounded-lg px-4 py-2 text-sm text-[var(--text-secondary)] hover:bg-[var(--bg-card-hover)] disabled:opacity-40"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleSave}
              disabled={!croppedArea || saving}
              className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white hover:bg-accent/85 disabled:opacity-40"
            >
              {saving ? "Saving…" : "Save crop"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Canvas crop + upload helpers ─────────────────────────

async function renderCroppedBlob(srcDataUrl: string, pixels: Area, slot: Slot): Promise<Blob> {
  const image = await loadImage(srcDataUrl);
  const canvas = document.createElement("canvas");
  canvas.width = slot.outputW;
  canvas.height = slot.outputH;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas 2d context unavailable");
  ctx.drawImage(
    image,
    pixels.x, pixels.y, pixels.width, pixels.height,
    0, 0, slot.outputW, slot.outputH,
  );
  // First pass at quality 0.9. If blob too big (can happen with huge sources),
  // retry at 0.85 which knocks ~30% off for photos without visible loss.
  let blob = await canvasToBlob(canvas, "image/jpeg", 0.9);
  if (blob.size > slot.maxBytes) {
    blob = await canvasToBlob(canvas, "image/jpeg", 0.85);
  }
  if (blob.size > slot.maxBytes) {
    throw new Error(
      `Cropped image still over ${Math.round(slot.maxBytes / 1024 / 1024)}MB after compression. Try a smaller source.`,
    );
  }
  return blob;
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Failed to load image"));
    img.src = src;
  });
}

function canvasToBlob(canvas: HTMLCanvasElement, type: string, quality: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error("Canvas toBlob failed"));
    }, type, quality);
  });
}

async function uploadBlob(blob: Blob, slotKey: SlotKey): Promise<string> {
  const filename = `campaign-${slotKey}-${Date.now()}.jpg`;
  const file = new File([blob], filename, { type: "image/jpeg" });
  const fd = new FormData();
  fd.append("file", file);
  const res = await fetch("/api/upload", { method: "POST", body: fd });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || `Upload failed (${res.status})`);
  }
  const data = await res.json();
  if (!data.url) throw new Error("Upload response missing URL");
  return data.url as string;
}
