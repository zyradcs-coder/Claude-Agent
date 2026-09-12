import { supabase } from "@/lib/supabase";

function dayRange(dateStr: string) {
  const start = new Date(`${dateStr}T00:00:00.000Z`);
  const end = new Date(start.getTime() + 24 * 60 * 60 * 1000);
  return { start: start.toISOString(), end: end.toISOString() };
}

// First Response Time (customer's first message -> first bot/agent reply)
// and resolution time (created_at -> closed_at), computed from raw rows for
// conversations touched within [start, end).
async function computeFrtAndResolution(start: string, end: string) {
  const { data: convos } = await supabase
    .from("conversations")
    .select("id, created_at, closed_at, status")
    .gte("created_at", start)
    .lt("created_at", end);

  const ids = (convos || []).map((c) => c.id);
  const frtSamples: number[] = [];
  const resolutionSamples: number[] = [];

  if (ids.length) {
    const { data: messages } = await supabase
      .from("messages")
      .select("conversation_id, role, created_at")
      .in("conversation_id", ids)
      .order("created_at", { ascending: true });

    const firstCustomer = new Map<string, string>();
    const firstReply = new Map<string, string>();
    for (const m of messages || []) {
      if (m.role === "user" && !firstCustomer.has(m.conversation_id)) {
        firstCustomer.set(m.conversation_id, m.created_at);
      } else if (m.role === "assistant" && firstCustomer.has(m.conversation_id) && !firstReply.has(m.conversation_id)) {
        firstReply.set(m.conversation_id, m.created_at);
      }
    }
    for (const [id, t0] of firstCustomer) {
      const t1 = firstReply.get(id);
      if (t1) frtSamples.push((new Date(t1).getTime() - new Date(t0).getTime()) / 1000);
    }
  }

  for (const c of convos || []) {
    if (c.status === "closed" && c.closed_at) {
      resolutionSamples.push((new Date(c.closed_at).getTime() - new Date(c.created_at).getTime()) / 1000);
    }
  }

  const avg = (arr: number[]) => (arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : null);
  return { avgFrtSeconds: avg(frtSamples), avgResolutionSeconds: avg(resolutionSamples) };
}

// Rolls up one completed UTC day into daily_stats. Called by the daily cron
// for "yesterday" - idempotent (upsert), safe to re-run for backfill too.
export async function rollupDay(dateStr: string) {
  const { start, end } = dayRange(dateStr);

  const { data: messages } = await supabase
    .from("messages")
    .select("role, sender_type, created_at")
    .gte("created_at", start)
    .lt("created_at", end);

  const messagesInbound = (messages || []).filter((m) => m.role === "user").length;
  const messagesOutboundAi = (messages || []).filter((m) => m.sender_type === "system").length;
  const messagesOutboundAgent = (messages || []).filter((m) => m.sender_type === "agent").length;

  const { count: newConversations } = await supabase
    .from("conversations")
    .select("id", { count: "exact", head: true })
    .gte("created_at", start)
    .lt("created_at", end);

  const { count: conversationsClosed } = await supabase
    .from("conversations")
    .select("id", { count: "exact", head: true })
    .gte("closed_at", start)
    .lt("closed_at", end);

  const { avgFrtSeconds, avgResolutionSeconds } = await computeFrtAndResolution(start, end);

  const { data: runs } = await supabase
    .from("automation_runs")
    .select("status")
    .gte("created_at", start)
    .lt("created_at", end);
  const automationSuccess = (runs || []).filter((r) => r.status === "success").length;
  const automationError = (runs || []).filter((r) => r.status === "error").length;

  await supabase.from("daily_stats").upsert({
    date: dateStr,
    messages_inbound: messagesInbound,
    messages_outbound_ai: messagesOutboundAi,
    messages_outbound_agent: messagesOutboundAgent,
    new_conversations: newConversations || 0,
    conversations_closed: conversationsClosed || 0,
    avg_frt_seconds: avgFrtSeconds,
    avg_resolution_seconds: avgResolutionSeconds,
    automation_runs_success: automationSuccess,
    automation_runs_error: automationError,
  });
}

function isoDate(d: Date) {
  return d.toISOString().slice(0, 10);
}

export async function getAnalytics(rangeDays: number) {
  const today = isoDate(new Date());
  const rangeStartDate = isoDate(new Date(Date.now() - (rangeDays - 1) * 86400000));

  // Historical days from the pre-aggregated table...
  const { data: history } = await supabase
    .from("daily_stats")
    .select("*")
    .gte("date", rangeStartDate)
    .lt("date", today)
    .order("date", { ascending: true });

  // ...plus today, computed live (bounded to one day of data).
  const { start: todayStart, end: todayEnd } = dayRange(today);
  const { data: todayMessages } = await supabase
    .from("messages")
    .select("role, sender_type, created_at")
    .gte("created_at", todayStart)
    .lt("created_at", todayEnd);
  const { count: todayNewConvos } = await supabase
    .from("conversations")
    .select("id", { count: "exact", head: true })
    .gte("created_at", todayStart)
    .lt("created_at", todayEnd);
  const { avgFrtSeconds: todayFrt, avgResolutionSeconds: todayResolution } =
    await computeFrtAndResolution(todayStart, todayEnd);

  const todayRow = {
    date: today,
    messages_inbound: (todayMessages || []).filter((m) => m.role === "user").length,
    messages_outbound_ai: (todayMessages || []).filter((m) => m.sender_type === "system").length,
    messages_outbound_agent: (todayMessages || []).filter((m) => m.sender_type === "agent").length,
    new_conversations: todayNewConvos || 0,
    avg_frt_seconds: todayFrt,
    avg_resolution_seconds: todayResolution,
  };

  const daily = [...(history || []), todayRow];

  // Hourly inbound histogram across the whole range (cheap at current volume;
  // see migration comment on indexing this properly as it grows).
  const { start: rangeStartIso } = dayRange(rangeStartDate);
  const { data: rangeMessages } = await supabase
    .from("messages")
    .select("created_at, role")
    .eq("role", "user")
    .gte("created_at", rangeStartIso);
  const hourly = Array(24).fill(0);
  for (const m of rangeMessages || []) {
    hourly[new Date(m.created_at).getUTCHours()]++;
  }

  // Pipeline: value in play per stage + win rate, across all pipelines.
  const { data: stages } = await supabase.from("pipeline_stages").select("*");
  const { data: deals } = await supabase.from("deals").select("stage_id, value");
  const stageMap = new Map((stages || []).map((s) => [s.id, s]));
  const funnel = (stages || [])
    .slice()
    .sort((a, b) => a.order_weight - b.order_weight)
    .map((s) => {
      const stageDeals = (deals || []).filter((d) => d.stage_id === s.id);
      return {
        name: s.name,
        is_won: s.is_won,
        is_lost: s.is_lost,
        count: stageDeals.length,
        value: stageDeals.reduce((sum, d) => sum + Number(d.value || 0), 0),
      };
    });
  const wonCount = funnel.filter((f) => f.is_won).reduce((s, f) => s + f.count, 0);
  const lostCount = funnel.filter((f) => f.is_lost).reduce((s, f) => s + f.count, 0);
  const activeValue = funnel
    .filter((f) => !f.is_won && !f.is_lost)
    .reduce((sum, f) => sum + f.value, 0);
  const winRate = wonCount + lostCount > 0 ? wonCount / (wonCount + lostCount) : null;

  // Broadcasts: delivery/read rates.
  const { data: broadcasts } = await supabase
    .from("broadcasts")
    .select("id, name, status, total, sent, delivered, read, failed")
    .order("created_at", { ascending: false })
    .limit(10);
  const totals = (broadcasts || []).reduce(
    (acc, b) => {
      acc.sent += b.sent;
      acc.delivered += b.delivered;
      acc.read += b.read;
      acc.failed += b.failed;
      return acc;
    },
    { sent: 0, delivered: 0, read: 0, failed: 0 }
  );

  // AI usage: replies + automation run outcomes across the range.
  const aiReplies = daily.reduce((s, d) => s + (Number(d.messages_outbound_ai) || 0), 0);
  const agentReplies = daily.reduce((s, d) => s + (Number(d.messages_outbound_agent) || 0), 0);
  const { data: allRuns } = await supabase
    .from("automation_runs")
    .select("status")
    .gte("created_at", rangeStartIso);
  const runsByStatus = {
    success: (allRuns || []).filter((r) => r.status === "success").length,
    error: (allRuns || []).filter((r) => r.status === "error").length,
    skipped: (allRuns || []).filter((r) => r.status === "skipped").length,
  };

  return {
    daily,
    hourly,
    pipeline: { funnel, activeValue, winRate, wonCount, lostCount },
    broadcasts: { recent: broadcasts || [], totals },
    ai: { aiReplies, agentReplies, runsByStatus },
  };
}
