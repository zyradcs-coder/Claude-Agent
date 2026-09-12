"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import Link from "next/link";
import type { Contact, DealWithContact, Pipeline, PipelineStage } from "@/lib/types";

type PipelineWithStages = Pipeline & { stages: PipelineStage[] };

export default function PipelinesPage() {
  const [pipelines, setPipelines] = useState<PipelineWithStages[]>([]);
  const [pipelineId, setPipelineId] = useState<string | null>(null);
  const [deals, setDeals] = useState<DealWithContact[]>([]);
  const [draggingId, setDraggingId] = useState<string | null>(null);

  const [showNewDeal, setShowNewDeal] = useState<string | null>(null); // stage id
  const [title, setTitle] = useState("");
  const [value, setValue] = useState("");
  const [contactSearch, setContactSearch] = useState("");
  const [contactResults, setContactResults] = useState<Contact[]>([]);
  const [selectedContact, setSelectedContact] = useState<Contact | null>(null);

  const pipeline = pipelines.find((p) => p.id === pipelineId);
  const stages = useMemo(
    () => (pipeline?.stages || []).slice().sort((a, b) => a.order_weight - b.order_weight),
    [pipeline]
  );

  const fetchDeals = useCallback(async (pid: string) => {
    const res = await fetch(`/api/deals?pipeline_id=${pid}`);
    const data = await res.json();
    setDeals(Array.isArray(data) ? data : []);
  }, []);

  useEffect(() => {
    fetch("/api/pipelines")
      .then((r) => r.json())
      .then((data: PipelineWithStages[]) => {
        setPipelines(Array.isArray(data) ? data : []);
        if (Array.isArray(data) && data[0]) setPipelineId(data[0].id);
      });
  }, []);

  useEffect(() => {
    if (pipelineId) fetchDeals(pipelineId);
  }, [pipelineId, fetchDeals]);

  useEffect(() => {
    if (!contactSearch.trim()) {
      setContactResults([]);
      return;
    }
    const t = setTimeout(() => {
      fetch(`/api/contacts?search=${encodeURIComponent(contactSearch)}`)
        .then((r) => r.json())
        .then((d) => setContactResults(Array.isArray(d) ? d.slice(0, 6) : []));
    }, 250);
    return () => clearTimeout(t);
  }, [contactSearch]);

  function dealsForStage(stageId: string) {
    return deals.filter((d) => d.stage_id === stageId);
  }

  function stageTotal(stageId: string) {
    return dealsForStage(stageId).reduce((sum, d) => sum + Number(d.value || 0), 0);
  }

  async function moveDeal(dealId: string, stageId: string) {
    setDeals((prev) => prev.map((d) => (d.id === dealId ? { ...d, stage_id: stageId } : d)));
    await fetch(`/api/deals/${dealId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ stage_id: stageId }),
    });
  }

  function resetForm() {
    setTitle("");
    setValue("");
    setContactSearch("");
    setContactResults([]);
    setSelectedContact(null);
    setShowNewDeal(null);
  }

  async function createDeal(stageId: string) {
    if (!title.trim() || !pipelineId) return;
    const res = await fetch("/api/deals", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        pipeline_id: pipelineId,
        stage_id: stageId,
        title: title.trim(),
        value: Number(value) || 0,
        contact_id: selectedContact?.id || null,
      }),
    });
    const data = await res.json();
    if (res.ok) setDeals((prev) => [data, ...prev]);
    resetForm();
  }

  function contactLabel(c: DealWithContact["contact"]) {
    if (!c) return null;
    const name = [c.first_name, c.last_name].filter(Boolean).join(" ");
    return name || c.phone_number;
  }

  return (
    <div className="min-h-screen bg-[#0f0f0f] font-sans text-white/90">
      <div className="px-6 py-4 border-b border-white/[0.06] flex items-center justify-between" style={{ background: "#141414" }}>
        <div className="flex items-center gap-4">
          <Link href="/" className="text-xs text-white/40 hover:text-white/70">← Inbox</Link>
          <h1 className="text-sm font-semibold">{pipeline?.name || "Sales Pipeline"}</h1>
        </div>
        <div className="text-xs text-white/40">
          Total: {stages.reduce((s, st) => s + stageTotal(st.id), 0).toLocaleString()} AED
        </div>
      </div>

      <div className="flex gap-4 p-6 overflow-x-auto items-start">
        {stages.map((stage) => (
          <div
            key={stage.id}
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault();
              if (draggingId) moveDeal(draggingId, stage.id);
              setDraggingId(null);
            }}
            className="w-[280px] flex-shrink-0 rounded-xl border border-white/[0.06] bg-[#141414] flex flex-col max-h-[calc(100vh-140px)]"
          >
            <div className="px-4 py-3 border-b border-white/[0.06]">
              <div className="flex items-center justify-between">
                <h2
                  className={`text-xs font-semibold uppercase tracking-wide ${
                    stage.is_won ? "text-emerald-400" : stage.is_lost ? "text-red-400" : "text-white/70"
                  }`}
                >
                  {stage.name}
                </h2>
                <span className="text-[10px] text-white/30">{dealsForStage(stage.id).length}</span>
              </div>
              <p className="text-[11px] text-white/40 mt-0.5">
                {stageTotal(stage.id).toLocaleString()} AED
              </p>
            </div>

            <div className="flex-1 overflow-y-auto p-2 space-y-2">
              {dealsForStage(stage.id).map((deal) => (
                <div
                  key={deal.id}
                  draggable
                  onDragStart={() => setDraggingId(deal.id)}
                  className="rounded-lg border border-white/[0.08] bg-white/[0.04] p-3 cursor-grab active:cursor-grabbing hover:bg-white/[0.06] transition-colors"
                >
                  <p className="text-sm font-medium text-white/90 truncate">{deal.title}</p>
                  {deal.contact && (
                    <p className="text-[11px] text-white/40 truncate mt-0.5">{contactLabel(deal.contact)}</p>
                  )}
                  <p className="text-xs text-emerald-400 mt-1.5 font-medium">
                    {Number(deal.value).toLocaleString()} {deal.currency}
                  </p>
                </div>
              ))}

              {showNewDeal === stage.id ? (
                <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/[0.06] p-3 space-y-2">
                  <input
                    autoFocus
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    placeholder="Deal title"
                    className="w-full bg-transparent text-sm text-white/90 placeholder:text-white/25 focus:outline-none border-b border-white/10 pb-1"
                  />
                  <input
                    value={value}
                    onChange={(e) => setValue(e.target.value)}
                    placeholder="Value (AED)"
                    type="number"
                    className="w-full bg-transparent text-sm text-white/90 placeholder:text-white/25 focus:outline-none border-b border-white/10 pb-1"
                  />
                  <div className="relative">
                    <input
                      value={selectedContact ? contactLabel({ ...selectedContact, id: selectedContact.id }) || "" : contactSearch}
                      onChange={(e) => {
                        setSelectedContact(null);
                        setContactSearch(e.target.value);
                      }}
                      placeholder="Link a contact (search phone/name)"
                      className="w-full bg-transparent text-sm text-white/90 placeholder:text-white/25 focus:outline-none border-b border-white/10 pb-1"
                    />
                    {contactResults.length > 0 && !selectedContact && (
                      <div className="absolute z-10 mt-1 w-full rounded-lg border border-white/10 bg-[#1c1c1c] shadow-lg">
                        {contactResults.map((c) => (
                          <button
                            key={c.id}
                            onClick={() => {
                              setSelectedContact(c);
                              setContactResults([]);
                            }}
                            className="w-full text-left px-3 py-2 text-xs text-white/80 hover:bg-white/[0.06]"
                          >
                            {[c.first_name, c.last_name].filter(Boolean).join(" ") || c.phone_number}
                            <span className="text-white/30 ml-1">{c.phone_number}</span>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                  <div className="flex gap-2 pt-1">
                    <button
                      onClick={() => createDeal(stage.id)}
                      disabled={!title.trim()}
                      className="flex-1 text-xs py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 text-white font-medium"
                    >
                      Add
                    </button>
                    <button
                      onClick={resetForm}
                      className="text-xs py-1.5 px-3 rounded-lg bg-white/[0.06] text-white/60 hover:bg-white/[0.1]"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <button
                  onClick={() => setShowNewDeal(stage.id)}
                  className="w-full text-xs py-2 rounded-lg border border-dashed border-white/10 text-white/30 hover:text-white/60 hover:border-white/20 transition-colors"
                >
                  + Add deal
                </button>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
