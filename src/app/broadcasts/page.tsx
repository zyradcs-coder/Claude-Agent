"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import type { Broadcast } from "@/lib/types";
import type { WhatsAppTemplate } from "@/lib/whatsapp";

export default function BroadcastsPage() {
  const [broadcasts, setBroadcasts] = useState<Broadcast[]>([]);
  const [templates, setTemplates] = useState<WhatsAppTemplate[]>([]);
  const [templatesError, setTemplatesError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [creating, setCreating] = useState(false);
  const [sendingId, setSendingId] = useState<string | null>(null);

  const [name, setName] = useState("");
  const [templateName, setTemplateName] = useState("");
  const [segmentTag, setSegmentTag] = useState("");
  const [scheduledAt, setScheduledAt] = useState("");

  const template = templates.find((t) => t.name === templateName);
  const bodyComponent = template?.components.find((c) => c.type === "BODY");
  const varCount = bodyComponent?.text ? (bodyComponent.text.match(/\{\{\d+\}\}/g) || []).length : 0;
  const [varSources, setVarSources] = useState<Record<string, string>>({});

  const fetchBroadcasts = useCallback(async () => {
    const res = await fetch("/api/broadcasts");
    const data = await res.json();
    setBroadcasts(Array.isArray(data) ? data : []);
  }, []);

  useEffect(() => {
    fetchBroadcasts();
    fetch("/api/templates")
      .then((r) => r.json())
      .then((d) => {
        if (Array.isArray(d)) setTemplates(d);
        else setTemplatesError(d.error || "Failed to load templates");
      });
    const interval = setInterval(fetchBroadcasts, 4000); // poll for live progress
    return () => clearInterval(interval);
  }, [fetchBroadcasts]);

  function resetForm() {
    setName("");
    setTemplateName("");
    setSegmentTag("");
    setScheduledAt("");
    setVarSources({});
    setShowForm(false);
  }

  async function createBroadcast() {
    if (!name.trim() || !templateName) return;
    setCreating(true);
    const variable_mapping: Record<string, string> = {};
    for (let i = 1; i <= varCount; i++) {
      if (varSources[i]) variable_mapping[i] = varSources[i];
    }
    const res = await fetch("/api/broadcasts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: name.trim(),
        template_name: templateName,
        template_language: template?.language || "en_US",
        variable_mapping,
        segment_tag: segmentTag.trim() || null,
        scheduled_at: scheduledAt ? new Date(scheduledAt).toISOString() : null,
      }),
    });
    const data = await res.json();
    setCreating(false);
    if (res.ok) {
      resetForm();
      fetchBroadcasts();
    } else {
      alert(data.error || "Failed to create broadcast");
    }
  }

  async function sendNow(id: string) {
    setSendingId(id);
    await fetch(`/api/broadcasts/${id}/dispatch`, { method: "POST" });
    setSendingId(null);
    fetchBroadcasts();
  }

  const STATUS_STYLE: Record<string, string> = {
    draft: "bg-white/10 text-white/40",
    scheduled: "bg-sky-500/20 text-sky-400",
    sending: "bg-amber-500/20 text-amber-400",
    completed: "bg-emerald-500/20 text-emerald-400",
    failed: "bg-red-500/20 text-red-400",
  };

  return (
    <div className="min-h-screen bg-[#0f0f0f] font-sans text-white/90">
      <div className="px-6 py-4 border-b border-white/[0.06] flex items-center justify-between" style={{ background: "#141414" }}>
        <div className="flex items-center gap-4">
          <Link href="/" className="text-xs text-white/40 hover:text-white/70">← Inbox</Link>
          <h1 className="text-sm font-semibold">Broadcast Campaigns</h1>
        </div>
        <button
          onClick={() => setShowForm((v) => !v)}
          className="text-xs px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-medium"
        >
          + New broadcast
        </button>
      </div>

      <div className="max-w-3xl mx-auto p-6 space-y-4">
        {templatesError && (
          <p className="text-xs text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">
            Couldn&apos;t load Meta templates: {templatesError}
          </p>
        )}
        <p className="text-xs text-white/30">
          Only Meta-approved templates can be sent here - required outside the 24h customer service
          window. Scheduled sends are picked up once a day by cron (Vercel Hobby plan limit); use
          &quot;Send now&quot; for anything time-sensitive.
        </p>

        {showForm && (
          <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/[0.04] p-5 space-y-3">
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Campaign name"
              className="w-full bg-white/[0.04] border border-white/10 rounded-lg px-3 py-2 text-sm placeholder:text-white/25 focus:outline-none focus:border-emerald-500/40"
            />

            <div>
              <label className="block text-[11px] text-white/40 mb-1">Template (Meta-approved only)</label>
              <select
                value={templateName}
                onChange={(e) => {
                  setTemplateName(e.target.value);
                  setVarSources({});
                }}
                className="w-full bg-white/[0.04] border border-white/10 rounded-lg px-3 py-2 text-sm focus:outline-none"
              >
                <option value="">Select template…</option>
                {templates.map((t) => (
                  <option key={t.id} value={t.name}>{t.name} ({t.language})</option>
                ))}
              </select>
              {bodyComponent?.text && (
                <p className="text-[11px] text-white/40 mt-1.5 bg-white/[0.03] rounded-lg px-3 py-2">
                  {bodyComponent.text}
                </p>
              )}
            </div>

            {varCount > 0 && (
              <div className="space-y-2">
                <label className="block text-[11px] text-white/40">Variables</label>
                {Array.from({ length: varCount }, (_, i) => i + 1).map((n) => (
                  <select
                    key={n}
                    value={varSources[n] || ""}
                    onChange={(e) => setVarSources((prev) => ({ ...prev, [n]: e.target.value }))}
                    className="w-full bg-white/[0.04] border border-white/10 rounded-lg px-3 py-2 text-sm focus:outline-none"
                  >
                    <option value="">{`{{${n}}} → select contact field…`}</option>
                    <option value="first_name">First name</option>
                    <option value="last_name">Last name</option>
                    <option value="phone_number">Phone number</option>
                  </select>
                ))}
              </div>
            )}

            <div>
              <label className="block text-[11px] text-white/40 mb-1">Audience</label>
              <input
                value={segmentTag}
                onChange={(e) => setSegmentTag(e.target.value)}
                placeholder="Contact tag (leave blank = all contacts)"
                className="w-full bg-white/[0.04] border border-white/10 rounded-lg px-3 py-2 text-sm placeholder:text-white/25 focus:outline-none"
              />
            </div>

            <div>
              <label className="block text-[11px] text-white/40 mb-1">Schedule (optional)</label>
              <input
                type="datetime-local"
                value={scheduledAt}
                onChange={(e) => setScheduledAt(e.target.value)}
                className="w-full bg-white/[0.04] border border-white/10 rounded-lg px-3 py-2 text-sm focus:outline-none"
              />
            </div>

            <div className="flex gap-2 pt-1">
              <button
                onClick={createBroadcast}
                disabled={!name.trim() || !templateName || creating}
                className="text-xs px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 text-white font-medium"
              >
                {creating ? "Creating…" : scheduledAt ? "Schedule" : "Send now"}
              </button>
              <button onClick={resetForm} className="text-xs px-4 py-2 rounded-lg bg-white/[0.06] text-white/60 hover:bg-white/[0.1]">
                Cancel
              </button>
            </div>
          </div>
        )}

        {broadcasts.length === 0 && !showForm && (
          <p className="text-sm text-white/30 text-center py-12">No broadcasts yet.</p>
        )}

        {broadcasts.map((b) => (
          <div key={b.id} className="rounded-xl border border-white/[0.08] bg-[#141414] p-4">
            <div className="flex items-center justify-between">
              <div>
                <div className="flex items-center gap-2">
                  <p className="text-sm font-medium text-white/90">{b.name}</p>
                  <span className={`text-[9px] px-1.5 py-0.5 rounded uppercase font-medium ${STATUS_STYLE[b.status]}`}>
                    {b.status}
                  </span>
                </div>
                <p className="text-[11px] text-white/40 mt-0.5">
                  {b.template_name} · {b.segment_tag ? `tag: ${b.segment_tag}` : "all contacts"} · {b.total} recipients
                </p>
              </div>
              {(b.status === "scheduled" || b.status === "sending" || b.status === "draft") && (
                <button
                  onClick={() => sendNow(b.id)}
                  disabled={sendingId === b.id}
                  className="text-xs px-3 py-1.5 rounded-lg bg-white/[0.06] text-white/70 hover:bg-white/[0.1] border border-white/[0.08] disabled:opacity-50 flex-shrink-0"
                >
                  {sendingId === b.id ? "Sending…" : b.status === "sending" ? "Continue sending" : "Send now"}
                </button>
              )}
            </div>

            <div className="grid grid-cols-4 gap-2 mt-3">
              {[
                ["Sent", b.sent, "text-white/70"],
                ["Delivered", b.delivered, "text-sky-400"],
                ["Read", b.read, "text-emerald-400"],
                ["Failed", b.failed, "text-red-400"],
              ].map(([label, value, cls]) => (
                <div key={label as string} className="rounded-lg bg-white/[0.03] px-3 py-2">
                  <p className={`text-lg font-semibold ${cls}`}>{value}</p>
                  <p className="text-[10px] text-white/30 uppercase tracking-wide">{label}</p>
                </div>
              ))}
            </div>

            {b.total > 0 && (
              <div className="w-full h-1.5 bg-white/[0.06] rounded-full mt-3 overflow-hidden">
                <div
                  className="h-full bg-emerald-500 transition-all duration-500"
                  style={{ width: `${Math.min(100, ((b.sent + b.failed) / b.total) * 100)}%` }}
                />
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
