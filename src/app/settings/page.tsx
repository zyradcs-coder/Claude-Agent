"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

export default function SettingsPage() {
  const [configured, setConfigured] = useState(false);
  const [key, setKey] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetch("/api/settings/gemini-key")
      .then((r) => r.json())
      .then((d) => setConfigured(Boolean(d.configured)));
  }, []);

  async function save() {
    if (!key.trim()) return;
    setSaving(true);
    const res = await fetch("/api/settings/gemini-key", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ key: key.trim() }),
    });
    setSaving(false);
    if (res.ok) {
      setConfigured(true);
      setKey("");
    }
  }

  async function clear() {
    await fetch("/api/settings/gemini-key", { method: "DELETE" });
    setConfigured(false);
  }

  return (
    <div className="min-h-screen bg-[#0f0f0f] font-sans text-white/90">
      <div className="px-6 py-4 border-b border-white/[0.06] flex items-center gap-4" style={{ background: "#141414" }}>
        <Link href="/" className="text-xs text-white/40 hover:text-white/70">← Inbox</Link>
        <h1 className="text-sm font-semibold">Settings</h1>
      </div>

      <div className="max-w-lg mx-auto p-6">
        <div className="rounded-xl border border-white/[0.08] bg-[#141414] p-5 space-y-3">
          <div>
            <h2 className="text-sm font-semibold">Bring your own AI key</h2>
            <p className="text-[11px] text-white/40 mt-1 leading-relaxed">
              Optional. This app runs on Google Gemini. If you'd rather use your own Gemini API key
              (your own quota and billing, not a shared/marked-up key), paste it here - it's
              encrypted at rest (AES-256-GCM) and only ever decrypted server-side to call the API.
              Leave unset to keep using the shared key.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <span className={`w-2 h-2 rounded-full ${configured ? "bg-emerald-500" : "bg-white/20"}`} />
            <span className="text-xs text-white/60">
              {configured ? "Your own key is active" : "Using the shared key"}
            </span>
          </div>

          <input
            type="password"
            value={key}
            onChange={(e) => setKey(e.target.value)}
            placeholder="AIza… (Google AI Studio key)"
            className="w-full bg-white/[0.04] border border-white/10 rounded-lg px-3 py-2 text-sm placeholder:text-white/25 focus:outline-none"
          />

          <div className="flex gap-2">
            <button
              onClick={save}
              disabled={!key.trim() || saving}
              className="text-xs px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 text-white font-medium"
            >
              {saving ? "Saving…" : "Save key"}
            </button>
            {configured && (
              <button onClick={clear} className="text-xs px-4 py-2 rounded-lg bg-white/[0.06] text-white/60 hover:bg-white/[0.1]">
                Remove & use shared key
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
