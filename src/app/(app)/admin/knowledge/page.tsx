"use client";

import { useEffect, useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";
import { Plus, Pencil, Trash2, BookOpen, Sparkles } from "lucide-react";
import { toast } from "sonner";

interface KnowledgeEntry {
  id: string;
  category: string;
  question: string;
  answer: string;
}

export default function KnowledgePage() {
  const [entries, setEntries] = useState<KnowledgeEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<KnowledgeEntry | null>(null);
  const [form, setForm] = useState({ category: "", question: "", answer: "" });
  const [saving, setSaving] = useState(false);
  const [seeding, setSeeding] = useState(false);

  const load = () => {
    fetch("/api/admin/knowledge")
      .then((r) => r.json())
      .then((data) => { if (Array.isArray(data)) setEntries(data); })
      .catch(() => {})
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  const handleSeed = async () => {
    setSeeding(true);
    try {
      const res = await fetch("/api/admin/knowledge/seed", { method: "POST" });
      const data = await res.json();
      toast.success(data.message || "Seeded!");
      load();
    } catch { toast.error("Seed failed"); }
    setSeeding(false);
  };

  const openAdd = () => {
    setEditing(null);
    setForm({ category: "", question: "", answer: "" });
    setShowModal(true);
  };

  const openEdit = (entry: KnowledgeEntry) => {
    setEditing(entry);
    setForm({ category: entry.category, question: entry.question, answer: entry.answer });
    setShowModal(true);
  };

  const handleSave = async () => {
    if (!form.category || !form.question || !form.answer) {
      toast.error("All fields are required");
      return;
    }
    setSaving(true);
    try {
      if (editing) {
        await fetch("/api/admin/knowledge", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id: editing.id, ...form }),
        });
        toast.success("Updated");
      } else {
        await fetch("/api/admin/knowledge", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(form),
        });
        toast.success("Added");
      }
      setShowModal(false);
      load();
    } catch { toast.error("Save failed"); }
    setSaving(false);
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Delete this Q&A?")) return;
    try {
      await fetch(`/api/admin/knowledge?id=${id}`, { method: "DELETE" });
      toast.success("Deleted");
      load();
    } catch { toast.error("Delete failed"); }
  };

  // Group by category
  const categories = new Map<string, KnowledgeEntry[]>();
  entries.forEach((e) => {
    const list = categories.get(e.category) || [];
    list.push(e);
    categories.set(e.category, list);
  });

  if (loading) {
    return <div className="flex items-center justify-center py-20"><div className="h-8 w-8 animate-spin rounded-full border-2 border-[var(--border-color)] border-t-accent" /></div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-[var(--text-primary)]">AI Knowledge Base</h1>
          <p className="text-base text-[var(--text-secondary)]">{entries.length} Q&As — the AI chatbot uses these to answer clipper questions.</p>
        </div>
        <div className="flex items-center gap-2">
          {entries.length === 0 && (
            <Button variant="ghost" onClick={handleSeed} loading={seeding} icon={<Sparkles className="h-4 w-4" />}>
              Seed defaults
            </Button>
          )}
          <Button onClick={openAdd} icon={<Plus className="h-4 w-4" />}>
            Add Q&A
          </Button>
        </div>
      </div>

      {entries.length === 0 ? (
        <Card className="p-8 text-center">
          <BookOpen className="h-10 w-10 text-[var(--text-muted)] mx-auto mb-3 opacity-40" />
          <p className="text-sm text-[var(--text-muted)] mb-3">No knowledge entries yet.</p>
          <Button onClick={handleSeed} loading={seeding} icon={<Sparkles className="h-4 w-4" />}>
            Seed with 20 default Q&As
          </Button>
        </Card>
      ) : (
        Array.from(categories).map(([category, items]) => (
          <div key={category}>
            <p className="text-xs font-semibold uppercase tracking-widest text-[var(--text-muted)] mb-2 px-1">{category}</p>
            <div className="space-y-2">
              {items.map((entry) => (
                <Card key={entry.id} className="p-4">
                  <div className="flex items-start gap-3">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-[var(--text-primary)] mb-1">{entry.question}</p>
                      <p className="text-sm text-[var(--text-secondary)] whitespace-pre-wrap">{entry.answer}</p>
                    </div>
                    <div className="flex items-center gap-1 flex-shrink-0">
                      <button onClick={() => openEdit(entry)} className="rounded-lg p-1.5 text-[var(--text-muted)] hover:text-accent hover:bg-accent/10 transition-colors cursor-pointer">
                        <Pencil className="h-3.5 w-3.5" />
                      </button>
                      <button onClick={() => handleDelete(entry.id)} className="rounded-lg p-1.5 text-[var(--text-muted)] hover:text-red-400 hover:bg-red-500/10 transition-colors cursor-pointer">
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>
                </Card>
              ))}
            </div>
          </div>
        ))
      )}

      <Modal open={showModal} onClose={() => setShowModal(false)} title={editing ? "Edit Q&A" : "Add Q&A"}>
        <div className="space-y-4">
          <Input id="category" label="Category" placeholder="e.g. Earnings, Clips, Payouts" value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} />
          <Input id="question" label="Question" placeholder="How do earnings work?" value={form.question} onChange={(e) => setForm({ ...form, question: e.target.value })} />
          <div>
            <label htmlFor="answer" className="block text-sm font-medium text-[var(--text-secondary)] mb-1.5">Answer</label>
            <textarea
              id="answer"
              rows={4}
              placeholder="CPM-based. Your views are tracked automatically..."
              value={form.answer}
              onChange={(e) => setForm({ ...form, answer: e.target.value })}
              className="w-full resize-none rounded-xl border border-[var(--border-color)] bg-[var(--bg-input)] px-4 py-3 text-sm text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:border-accent focus:ring-1 focus:ring-accent focus:outline-none transition-colors"
            />
          </div>
          <div className="flex justify-end gap-3 pt-2">
            <Button variant="ghost" onClick={() => setShowModal(false)}>Cancel</Button>
            <Button onClick={handleSave} loading={saving}>{editing ? "Save changes" : "Add"}</Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
