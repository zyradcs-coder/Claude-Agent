"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import type { Automation, AutomationRun, Profile, Pipeline, PipelineStage, TriggerType, ActionType } from "@/lib/types";

type PipelineWithStages = Pipeline & { stages: PipelineStage[] };

const TRIGGER_LABELS: Record<TriggerType, string> = {
  new_contact: "New contact created",
  keyword: "Message contains keyword",
  conversation_idle: "Conversation idle for X hours",
};
const ACTION_LABELS: Record<ActionType, string> = {
  apply_tag: "Apply tag",
  assign_agent: "Assign agent",
  send_message: "Send WhatsApp message",
  move_stage: "Move pipeline stage",
};

export default function AutomationsPage() {
  const [automations, setAutomations] = useState<Automation[]>([]);
  const [agents, setAgents] = useState<Profile[]>([]);
  const [pipelines, setPipelines] = useState<PipelineWithStages[]>([]);
  const [expandedRuns, setExpandedRuns] = useState<Record<string, AutomationRun[]>>({});
  const [showForm, setShowForm] = useState(false);
  const [runningIdleCheck, setRunningIdleCheck] = useState(false);

  const [name, setName] = useState("");
  const [triggerType, setTriggerType] = useState<TriggerType>("keyword");
  const [triggerConfig, setTriggerConfig] = useState<Record<string, string>>({});
  const [actionType, setActionType] = useState<ActionType>("apply_tag");
  const [actionConfig, setActionConfig] = useState<Record<string, string>>({});

  const fetchAutomations = useCallback(async () => {
    const res = await fetch("/api/automations");
    const data = await res.json();
    setAutomations(Array.isArray(data) ? data : []);
  }, []);

  useEffect(() => {
    fetchAutomations();
    fetch("/api/agents").then((r) => r.json()).then((d) => setAgents(Array.isArray(d) ? d : []));
    fetch("/api/pipelines").then((r) => r.json()).then((d) => setPipelines(Array.isArray(d) ? d : []));
  }, [fetchAutomations]);

  function resetForm() {
    setName("");
    setTriggerType("keyword");
    setTriggerConfig({});
    setActionType("apply_tag");
    setActionConfig({});
    setShowForm(false);
  }

  async function createAutomation() {
    if (!name.trim()) return;
    const res = await fetch("/api/automations", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: name.trim(),
        trigger_type: triggerType,
        trigger_config: triggerConfig,
        action_type: actionType,
        action_config: actionConfig,
      }),
    });
    if (res.ok) {
      resetForm();
      fetchAutomations();
    }
  }

  async function toggleEnabled(a: Automation) {
    setAutomations((prev) => prev.map((x) => (x.id === a.id ? { ...x, enabled: !a.enabled } : x)));
    await fetch(`/api/automations/${a.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ enabled: !a.enabled }),
    });
  }

  async function deleteAutomation(id: string) {
    setAutomations((prev) => prev.filter((a) => a.id !== id));
    await fetch(`/api/automations/${id}`, { method: "DELETE" });
  }

  async function toggleRuns(id: string) {
    if (expandedRuns[id]) {
      setExpandedRuns((prev) => {
        const next = { ...prev };
        delete next[id];
        return next;
      });
      return;
    }
    const res = await fetch(`/api/automations/${id}/runs`);
    const data = await res.json();
    setExpandedRuns((prev) => ({ ...prev, [id]: Array.isArray(data) ? data : [] }));
  }

  async function runIdleCheckNow() {
    setRunningIdleCheck(true);
    const res = await fetch("/api/automations/run-idle-check", { method: "POST" });
    const data = await res.json();
    setRunningIdleCheck(false);
    alert(res.ok ? `Fired ${data.fired} automation(s).` : data.error || "Failed");
  }

  function describeTrigger(a: Automation) {
    if (a.trigger_type === "keyword") return `contains "${a.trigger_config?.keyword || "?"}"`;
    if (a.trigger_type === "conversation_idle") return `idle ${a.trigger_config?.hours || 24}h`;
    return "";
  }

  function describeAction(a: Automation) {
    if (a.action_type === "apply_tag") return `tag "${a.action_config?.tag || "?"}"`;
    if (a.action_type === "assign_agent") {
      const agent = agents.find((ag) => ag.id === a.action_config?.agent_id);
      return agent?.display_name || agent?.email || "?";
    }
    if (a.action_type === "send_message") return `"${String(a.action_config?.message || "").slice(0, 40)}"`;
    if (a.action_type === "move_stage") {
      const pipeline = pipelines.find((p) => p.id === a.action_config?.pipeline_id);
      const stage = pipeline?.stages.find((s) => s.id === a.action_config?.stage_id);
      return stage?.name || "?";
    }
    return "";
  }

  return (
    <div className="min-h-screen bg-[#0f0f0f] font-sans text-white/90">
      <div className="px-6 py-4 border-b border-white/[0.06] flex items-center justify-between" style={{ background: "#141414" }}>
        <div className="flex items-center gap-4">
          <Link href="/" className="text-xs text-white/40 hover:text-white/70">← Inbox</Link>
          <h1 className="text-sm font-semibold">Automations</h1>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={runIdleCheckNow}
            disabled={runningIdleCheck}
            className="text-xs px-3 py-1.5 rounded-lg bg-white/[0.06] text-white/60 hover:bg-white/[0.1] border border-white/[0.08] disabled:opacity-50"
          >
            {runningIdleCheck ? "Checking…" : "Run idle check now"}
          </button>
          <button
            onClick={() => setShowForm((v) => !v)}
            className="text-xs px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-medium"
          >
            + New automation
          </button>
        </div>
      </div>

      <div className="max-w-3xl mx-auto p-6 space-y-4">
        <p className="text-xs text-white/30">
          "Conversation idle" automations are checked once a day (Vercel Cron, Hobby plan limit) —
          use "Run idle check now" to fire them immediately.
        </p>

        {showForm && (
          <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/[0.04] p-5 space-y-4">
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Automation name"
              className="w-full bg-white/[0.04] border border-white/10 rounded-lg px-3 py-2 text-sm text-white/90 placeholder:text-white/25 focus:outline-none focus:border-emerald-500/40"
            />

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-[11px] text-white/40 mb-1">When (trigger)</label>
                <select
                  value={triggerType}
                  onChange={(e) => {
                    setTriggerType(e.target.value as TriggerType);
                    setTriggerConfig({});
                  }}
                  className="w-full bg-white/[0.04] border border-white/10 rounded-lg px-3 py-2 text-sm text-white/90 focus:outline-none"
                >
                  {Object.entries(TRIGGER_LABELS).map(([v, l]) => (
                    <option key={v} value={v}>{l}</option>
                  ))}
                </select>
                {triggerType === "keyword" && (
                  <input
                    value={triggerConfig.keyword || ""}
                    onChange={(e) => setTriggerConfig({ keyword: e.target.value })}
                    placeholder="keyword, e.g. refund"
                    className="mt-2 w-full bg-white/[0.04] border border-white/10 rounded-lg px-3 py-2 text-sm text-white/90 placeholder:text-white/25 focus:outline-none"
                  />
                )}
                {triggerType === "conversation_idle" && (
                  <input
                    type="number"
                    value={triggerConfig.hours || "24"}
                    onChange={(e) => setTriggerConfig({ hours: e.target.value })}
                    placeholder="hours"
                    className="mt-2 w-full bg-white/[0.04] border border-white/10 rounded-lg px-3 py-2 text-sm text-white/90 placeholder:text-white/25 focus:outline-none"
                  />
                )}
              </div>

              <div>
                <label className="block text-[11px] text-white/40 mb-1">Then (action)</label>
                <select
                  value={actionType}
                  onChange={(e) => {
                    setActionType(e.target.value as ActionType);
                    setActionConfig({});
                  }}
                  className="w-full bg-white/[0.04] border border-white/10 rounded-lg px-3 py-2 text-sm text-white/90 focus:outline-none"
                >
                  {Object.entries(ACTION_LABELS).map(([v, l]) => (
                    <option key={v} value={v}>{l}</option>
                  ))}
                </select>

                {actionType === "apply_tag" && (
                  <input
                    value={actionConfig.tag || ""}
                    onChange={(e) => setActionConfig({ tag: e.target.value })}
                    placeholder="tag, e.g. VIP"
                    className="mt-2 w-full bg-white/[0.04] border border-white/10 rounded-lg px-3 py-2 text-sm text-white/90 placeholder:text-white/25 focus:outline-none"
                  />
                )}
                {actionType === "assign_agent" && (
                  <select
                    value={actionConfig.agent_id || ""}
                    onChange={(e) => setActionConfig({ agent_id: e.target.value })}
                    className="mt-2 w-full bg-white/[0.04] border border-white/10 rounded-lg px-3 py-2 text-sm text-white/90 focus:outline-none"
                  >
                    <option value="">Select agent…</option>
                    {agents.map((a) => (
                      <option key={a.id} value={a.id}>{a.display_name || a.email}</option>
                    ))}
                  </select>
                )}
                {actionType === "send_message" && (
                  <textarea
                    value={actionConfig.message || ""}
                    onChange={(e) => setActionConfig({ message: e.target.value })}
                    placeholder="Message... use {{name}} and {{phone}}"
                    rows={2}
                    className="mt-2 w-full bg-white/[0.04] border border-white/10 rounded-lg px-3 py-2 text-sm text-white/90 placeholder:text-white/25 focus:outline-none resize-none"
                  />
                )}
                {actionType === "move_stage" && (
                  <div className="mt-2 space-y-2">
                    <select
                      value={actionConfig.pipeline_id || ""}
                      onChange={(e) => setActionConfig({ pipeline_id: e.target.value, stage_id: "" })}
                      className="w-full bg-white/[0.04] border border-white/10 rounded-lg px-3 py-2 text-sm text-white/90 focus:outline-none"
                    >
                      <option value="">Select pipeline…</option>
                      {pipelines.map((p) => (
                        <option key={p.id} value={p.id}>{p.name}</option>
                      ))}
                    </select>
                    <select
                      value={actionConfig.stage_id || ""}
                      onChange={(e) => setActionConfig({ ...actionConfig, stage_id: e.target.value })}
                      disabled={!actionConfig.pipeline_id}
                      className="w-full bg-white/[0.04] border border-white/10 rounded-lg px-3 py-2 text-sm text-white/90 focus:outline-none disabled:opacity-40"
                    >
                      <option value="">Select stage…</option>
                      {pipelines
                        .find((p) => p.id === actionConfig.pipeline_id)
                        ?.stages.map((s) => (
                          <option key={s.id} value={s.id}>{s.name}</option>
                        ))}
                    </select>
                  </div>
                )}
              </div>
            </div>

            <div className="flex gap-2">
              <button
                onClick={createAutomation}
                disabled={!name.trim()}
                className="text-xs px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 text-white font-medium"
              >
                Create
              </button>
              <button
                onClick={resetForm}
                className="text-xs px-4 py-2 rounded-lg bg-white/[0.06] text-white/60 hover:bg-white/[0.1]"
              >
                Cancel
              </button>
            </div>
          </div>
        )}

        {automations.length === 0 && !showForm && (
          <p className="text-sm text-white/30 text-center py-12">No automations yet.</p>
        )}

        {automations.map((a) => (
          <div key={a.id} className="rounded-xl border border-white/[0.08] bg-[#141414] p-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <button
                  onClick={() => toggleEnabled(a)}
                  className={`w-9 h-5 rounded-full transition-colors relative ${a.enabled ? "bg-emerald-600" : "bg-white/10"}`}
                >
                  <span
                    className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-transform ${a.enabled ? "translate-x-4" : "translate-x-0.5"}`}
                  />
                </button>
                <div>
                  <p className="text-sm font-medium text-white/90">{a.name}</p>
                  <p className="text-[11px] text-white/40 mt-0.5">
                    When <span className="text-white/60">{TRIGGER_LABELS[a.trigger_type]}</span>
                    {describeTrigger(a) && ` (${describeTrigger(a)})`} → {" "}
                    <span className="text-white/60">{ACTION_LABELS[a.action_type]}</span>
                    {describeAction(a) && ` (${describeAction(a)})`}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <button onClick={() => toggleRuns(a.id)} className="text-[11px] text-white/40 hover:text-white/70">
                  {expandedRuns[a.id] ? "Hide runs" : "View runs"}
                </button>
                <button onClick={() => deleteAutomation(a.id)} className="text-[11px] text-red-400/70 hover:text-red-400">
                  Delete
                </button>
              </div>
            </div>

            {expandedRuns[a.id] && (
              <div className="mt-3 pt-3 border-t border-white/[0.06] space-y-1.5">
                {expandedRuns[a.id].length === 0 ? (
                  <p className="text-[11px] text-white/30">No runs yet.</p>
                ) : (
                  expandedRuns[a.id].map((run) => (
                    <div key={run.id} className="flex items-center gap-2 text-[11px]">
                      <span
                        className={`px-1.5 py-0.5 rounded uppercase font-medium ${
                          run.status === "success"
                            ? "bg-emerald-500/20 text-emerald-400"
                            : run.status === "error"
                              ? "bg-red-500/20 text-red-400"
                              : "bg-white/10 text-white/40"
                        }`}
                      >
                        {run.status}
                      </span>
                      <span className="text-white/50 truncate">{run.detail}</span>
                      <span className="text-white/25 ml-auto flex-shrink-0">
                        {new Date(run.created_at).toLocaleString()}
                      </span>
                    </div>
                  ))
                )}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
