"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";

interface DailyRow {
  date: string;
  messages_inbound: number;
  messages_outbound_ai: number;
  messages_outbound_agent: number;
  new_conversations: number;
  avg_frt_seconds: number | null;
  avg_resolution_seconds: number | null;
}

interface AnalyticsData {
  daily: DailyRow[];
  hourly: number[];
  pipeline: {
    funnel: { name: string; is_won: boolean; is_lost: boolean; count: number; value: number }[];
    activeValue: number;
    winRate: number | null;
    wonCount: number;
    lostCount: number;
  };
  broadcasts: {
    recent: { id: string; name: string; status: string; total: number; sent: number; delivered: number; read: number; failed: number }[];
    totals: { sent: number; delivered: number; read: number; failed: number };
  };
  ai: {
    aiReplies: number;
    agentReplies: number;
    runsByStatus: { success: number; error: number; skipped: number };
  };
}

function formatDuration(seconds: number | null) {
  if (seconds == null) return "—";
  if (seconds < 60) return `${Math.round(seconds)}s`;
  if (seconds < 3600) return `${Math.round(seconds / 60)}m`;
  return `${(seconds / 3600).toFixed(1)}h`;
}

function Stat({ label, value, sub }: { label: string; value: string | number; sub?: string }) {
  return (
    <div className="rounded-xl border border-white/[0.08] bg-[#141414] p-4">
      <p className="text-2xl font-semibold text-white/90">{value}</p>
      <p className="text-[11px] text-white/40 mt-1">{label}</p>
      {sub && <p className="text-[10px] text-white/25 mt-0.5">{sub}</p>}
    </div>
  );
}

export default function AnalyticsPage() {
  const [data, setData] = useState<AnalyticsData | null>(null);
  const [days, setDays] = useState(14);

  const fetchData = useCallback(async (d: number) => {
    const res = await fetch(`/api/analytics?days=${d}`);
    const json = await res.json();
    if (res.ok) setData(json);
  }, []);

  useEffect(() => {
    fetchData(days);
  }, [days, fetchData]);

  if (!data) {
    return (
      <div className="min-h-screen bg-[#0f0f0f] flex items-center justify-center text-white/40 text-sm">
        Loading…
      </div>
    );
  }

  const totalInbound = data.daily.reduce((s, d) => s + d.messages_inbound, 0);
  const totalOutboundAi = data.daily.reduce((s, d) => s + d.messages_outbound_ai, 0);
  const totalOutboundAgent = data.daily.reduce((s, d) => s + d.messages_outbound_agent, 0);
  const totalNewConvos = data.daily.reduce((s, d) => s + d.new_conversations, 0);
  const frtSamples = data.daily.map((d) => d.avg_frt_seconds).filter((v): v is number => v != null);
  const avgFrt = frtSamples.length ? frtSamples.reduce((a, b) => a + b, 0) / frtSamples.length : null;
  const resSamples = data.daily.map((d) => d.avg_resolution_seconds).filter((v): v is number => v != null);
  const avgResolution = resSamples.length ? resSamples.reduce((a, b) => a + b, 0) / resSamples.length : null;

  const maxDaily = Math.max(1, ...data.daily.map((d) => d.messages_inbound + d.messages_outbound_ai + d.messages_outbound_agent));
  const maxHourly = Math.max(1, ...data.hourly);
  const maxFunnel = Math.max(1, ...data.pipeline.funnel.map((f) => f.count));

  const deliveryRate = data.broadcasts.totals.sent
    ? Math.round((data.broadcasts.totals.delivered / data.broadcasts.totals.sent) * 100)
    : 0;
  const readRate = data.broadcasts.totals.sent
    ? Math.round((data.broadcasts.totals.read / data.broadcasts.totals.sent) * 100)
    : 0;
  const runsTotal = data.ai.runsByStatus.success + data.ai.runsByStatus.error + data.ai.runsByStatus.skipped;

  return (
    <div className="min-h-screen bg-[#0f0f0f] font-sans text-white/90">
      <div className="px-6 py-4 border-b border-white/[0.06] flex items-center justify-between" style={{ background: "#141414" }}>
        <div className="flex items-center gap-4">
          <Link href="/" className="text-xs text-white/40 hover:text-white/70">← Inbox</Link>
          <h1 className="text-sm font-semibold">Analytics</h1>
        </div>
        <div className="flex gap-1">
          {[7, 14, 30].map((d) => (
            <button
              key={d}
              onClick={() => setDays(d)}
              className={`text-xs px-3 py-1.5 rounded-lg ${days === d ? "bg-emerald-600 text-white" : "bg-white/[0.06] text-white/50 hover:bg-white/[0.1]"}`}
            >
              {d}d
            </button>
          ))}
        </div>
      </div>

      <div className="max-w-5xl mx-auto p-6 space-y-8">
        {/* Conversation volume */}
        <section>
          <h2 className="text-xs font-semibold uppercase tracking-wide text-white/40 mb-3">Conversation volume</h2>
          <div className="grid grid-cols-4 gap-3 mb-4">
            <Stat label="Inbound messages" value={totalInbound} />
            <Stat label="AI replies" value={totalOutboundAi} />
            <Stat label="Agent replies" value={totalOutboundAgent} />
            <Stat label="New conversations" value={totalNewConvos} />
          </div>
          <div className="rounded-xl border border-white/[0.08] bg-[#141414] p-4">
            <p className="text-[11px] text-white/40 mb-3">Daily volume (inbound + replies)</p>
            <div className="flex items-end gap-1 h-32">
              {data.daily.map((d) => {
                const total = d.messages_inbound + d.messages_outbound_ai + d.messages_outbound_agent;
                return (
                  <div key={d.date} className="flex-1 flex flex-col items-center gap-1 group relative">
                    <div
                      className="w-full bg-emerald-600/70 rounded-sm hover:bg-emerald-500 transition-colors"
                      style={{ height: `${(total / maxDaily) * 100}%`, minHeight: total ? 2 : 0 }}
                      title={`${d.date}: ${total} messages`}
                    />
                  </div>
                );
              })}
            </div>
            <div className="flex justify-between text-[9px] text-white/25 mt-1">
              <span>{data.daily[0]?.date}</span>
              <span>{data.daily[data.daily.length - 1]?.date}</span>
            </div>
          </div>
        </section>

        {/* Support metrics */}
        <section>
          <h2 className="text-xs font-semibold uppercase tracking-wide text-white/40 mb-3">Support</h2>
          <div className="grid grid-cols-2 gap-3 mb-4">
            <Stat label="Avg first response time" value={formatDuration(avgFrt)} />
            <Stat label="Avg resolution time" value={formatDuration(avgResolution)} />
          </div>
          <div className="rounded-xl border border-white/[0.08] bg-[#141414] p-4">
            <p className="text-[11px] text-white/40 mb-3">Incoming volume by hour of day (UTC)</p>
            <div className="flex items-end gap-1 h-24">
              {data.hourly.map((count, hour) => (
                <div key={hour} className="flex-1 flex flex-col items-center gap-1">
                  <div
                    className="w-full bg-sky-600/70 rounded-sm hover:bg-sky-500 transition-colors"
                    style={{ height: `${(count / maxHourly) * 100}%`, minHeight: count ? 2 : 0 }}
                    title={`${hour}:00 - ${count} messages`}
                  />
                </div>
              ))}
            </div>
            <div className="flex justify-between text-[9px] text-white/25 mt-1">
              <span>00:00</span>
              <span>12:00</span>
              <span>23:00</span>
            </div>
          </div>
        </section>

        {/* Pipeline */}
        <section>
          <h2 className="text-xs font-semibold uppercase tracking-wide text-white/40 mb-3">Pipeline conversions</h2>
          <div className="grid grid-cols-3 gap-3 mb-4">
            <Stat label="Active pipeline value" value={`${data.pipeline.activeValue.toLocaleString()} AED`} />
            <Stat
              label="Win rate"
              value={data.pipeline.winRate != null ? `${Math.round(data.pipeline.winRate * 100)}%` : "—"}
              sub={`${data.pipeline.wonCount} won / ${data.pipeline.lostCount} lost`}
            />
            <Stat label="Deals in flight" value={data.pipeline.funnel.filter((f) => !f.is_won && !f.is_lost).reduce((s, f) => s + f.count, 0)} />
          </div>
          <div className="rounded-xl border border-white/[0.08] bg-[#141414] p-4 space-y-2">
            {data.pipeline.funnel.map((stage) => (
              <div key={stage.name} className="flex items-center gap-3">
                <span className="text-xs text-white/60 w-28 flex-shrink-0 truncate">{stage.name}</span>
                <div className="flex-1 h-4 bg-white/[0.04] rounded overflow-hidden">
                  <div
                    className={`h-full rounded ${stage.is_won ? "bg-emerald-500" : stage.is_lost ? "bg-red-500" : "bg-sky-500"}`}
                    style={{ width: `${(stage.count / maxFunnel) * 100}%` }}
                  />
                </div>
                <span className="text-xs text-white/40 w-24 text-right flex-shrink-0">
                  {stage.count} · {stage.value.toLocaleString()} AED
                </span>
              </div>
            ))}
          </div>
        </section>

        {/* Broadcasts */}
        <section>
          <h2 className="text-xs font-semibold uppercase tracking-wide text-white/40 mb-3">Broadcast delivery</h2>
          <div className="grid grid-cols-4 gap-3 mb-4">
            <Stat label="Sent" value={data.broadcasts.totals.sent} />
            <Stat label="Delivered" value={`${deliveryRate}%`} sub={`${data.broadcasts.totals.delivered} messages`} />
            <Stat label="Read" value={`${readRate}%`} sub={`${data.broadcasts.totals.read} messages`} />
            <Stat label="Failed" value={data.broadcasts.totals.failed} />
          </div>
          {data.broadcasts.recent.length > 0 && (
            <div className="rounded-xl border border-white/[0.08] bg-[#141414] p-4 space-y-2">
              {data.broadcasts.recent.map((b) => (
                <div key={b.id} className="flex items-center justify-between text-xs">
                  <span className="text-white/70 truncate">{b.name}</span>
                  <span className="text-white/40 flex-shrink-0">
                    {b.sent}/{b.total} sent · {b.delivered} delivered · {b.read} read · {b.failed} failed
                  </span>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* AI usage */}
        <section>
          <h2 className="text-xs font-semibold uppercase tracking-wide text-white/40 mb-3">AI usage</h2>
          <div className="grid grid-cols-4 gap-3">
            <Stat label="AI replies sent" value={data.ai.aiReplies} />
            <Stat label="Agent (human) replies" value={data.ai.agentReplies} />
            <Stat
              label="Automation success rate"
              value={runsTotal ? `${Math.round((data.ai.runsByStatus.success / runsTotal) * 100)}%` : "—"}
              sub={`${runsTotal} runs`}
            />
            <Stat label="Automation errors" value={data.ai.runsByStatus.error} />
          </div>
        </section>
      </div>
    </div>
  );
}
