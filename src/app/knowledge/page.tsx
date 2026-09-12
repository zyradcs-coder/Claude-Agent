"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import Link from "next/link";
import type { KnowledgeDocument } from "@/lib/types";

export default function KnowledgePage() {
  const [docs, setDocs] = useState<KnowledgeDocument[]>([]);
  const [pasteName, setPasteName] = useState("");
  const [pasteContent, setPasteContent] = useState("");
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const fetchDocs = useCallback(async () => {
    const res = await fetch("/api/knowledge");
    const data = await res.json();
    setDocs(Array.isArray(data) ? data : []);
  }, []);

  useEffect(() => {
    fetchDocs();
    const interval = setInterval(fetchDocs, 4000); // chunk counts fill in as embedding runs
    return () => clearInterval(interval);
  }, [fetchDocs]);

  async function submitPaste() {
    if (!pasteName.trim() || !pasteContent.trim()) return;
    setUploading(true);
    const res = await fetch("/api/knowledge", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: pasteName.trim(), content: pasteContent }),
    });
    setUploading(false);
    if (res.ok) {
      setPasteName("");
      setPasteContent("");
      fetchDocs();
    } else {
      const data = await res.json();
      alert(data.error || "Failed to add document");
    }
  }

  async function uploadFile(file: File) {
    setUploading(true);
    const form = new FormData();
    form.append("file", file);
    const res = await fetch("/api/knowledge", { method: "POST", body: form });
    setUploading(false);
    if (res.ok) fetchDocs();
    else {
      const data = await res.json();
      alert(data.error || "Failed to upload");
    }
  }

  async function deleteDoc(id: string) {
    setDocs((prev) => prev.filter((d) => d.id !== id));
    await fetch(`/api/knowledge/${id}`, { method: "DELETE" });
  }

  return (
    <div className="min-h-screen bg-[#0f0f0f] font-sans text-white/90">
      <div className="px-6 py-4 border-b border-white/[0.06] flex items-center justify-between" style={{ background: "#141414" }}>
        <div className="flex items-center gap-4">
          <Link href="/" className="text-xs text-white/40 hover:text-white/70">← Inbox</Link>
          <h1 className="text-sm font-semibold">Knowledge Base</h1>
        </div>
        <Link href="/settings" className="text-xs text-white/40 hover:text-emerald-400">Settings →</Link>
      </div>

      <div className="max-w-2xl mx-auto p-6 space-y-4">
        <p className="text-xs text-white/30">
          Upload FAQs, service catalogues, or rate cards. The bot retrieves relevant chunks and
          grounds its replies in them - the customer never sees this happen.
        </p>

        <div className="rounded-xl border border-white/[0.08] bg-[#141414] p-4 space-y-3">
          <div className="flex items-center gap-2">
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading}
              className="text-xs px-3 py-1.5 rounded-lg bg-white/[0.06] hover:bg-white/[0.1] border border-white/[0.08] disabled:opacity-50"
            >
              Upload .pdf / .txt / .md
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept=".pdf,.txt,.md"
              className="hidden"
              onChange={(e) => e.target.files?.[0] && uploadFile(e.target.files[0])}
            />
            {uploading && <span className="text-[11px] text-white/40">Processing…</span>}
          </div>

          <div className="pt-2 border-t border-white/[0.06] space-y-2">
            <input
              value={pasteName}
              onChange={(e) => setPasteName(e.target.value)}
              placeholder="Document name"
              className="w-full bg-white/[0.04] border border-white/10 rounded-lg px-3 py-2 text-sm placeholder:text-white/25 focus:outline-none"
            />
            <textarea
              value={pasteContent}
              onChange={(e) => setPasteContent(e.target.value)}
              placeholder="Or paste text directly…"
              rows={4}
              className="w-full bg-white/[0.04] border border-white/10 rounded-lg px-3 py-2 text-sm placeholder:text-white/25 focus:outline-none resize-none"
            />
            <button
              onClick={submitPaste}
              disabled={!pasteName.trim() || !pasteContent.trim() || uploading}
              className="text-xs px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 text-white font-medium"
            >
              Add document
            </button>
          </div>
        </div>

        {docs.length === 0 && <p className="text-sm text-white/30 text-center py-8">No documents yet.</p>}

        {docs.map((d) => (
          <div key={d.id} className="rounded-xl border border-white/[0.08] bg-[#141414] p-4 flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-white/90">{d.name}</p>
              <p className="text-[11px] text-white/40 mt-0.5">
                {d.chunk_count > 0 ? `${d.chunk_count} chunks embedded` : "embedding…"} · {d.source_type}
              </p>
            </div>
            <button onClick={() => deleteDoc(d.id)} className="text-[11px] text-red-400/70 hover:text-red-400">
              Delete
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
