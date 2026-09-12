import { supabase } from "@/lib/supabase";
import { sendTemplateMessage } from "@/lib/whatsapp";
import type { Contact } from "@/lib/types";

const BATCH_SIZE = 200; // per dispatch call, bounded by the route's maxDuration
const DELAY_MS = 150; // ~6-7 msg/s, safely under Meta's lowest per-number tier

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function resolveVar(contact: Contact | null, source: string): string {
  if (!contact) return "";
  if (source === "first_name") return contact.first_name || "";
  if (source === "last_name") return contact.last_name || "";
  if (source === "phone_number") return contact.phone_number || "";
  if (source.startsWith("custom:")) {
    const key = source.slice("custom:".length);
    return String(contact.custom_fields?.[key] ?? "");
  }
  return "";
}

// Sends the next batch of pending recipients for a broadcast. Safe to call
// repeatedly (resumes where it left off) - used for immediate sends,
// manual "continue sending", and the daily scheduled-broadcast cron.
export async function dispatchBroadcast(broadcastId: string) {
  const { data: broadcast } = await supabase
    .from("broadcasts")
    .select("*")
    .eq("id", broadcastId)
    .single();
  if (!broadcast || broadcast.status === "completed") return { sent: 0, failed: 0, remaining: 0 };

  await supabase.from("broadcasts").update({ status: "sending" }).eq("id", broadcastId);

  const { data: recipients } = await supabase
    .from("broadcast_recipients")
    .select("*, contact:contacts(*)")
    .eq("broadcast_id", broadcastId)
    .eq("status", "pending")
    .order("created_at", { ascending: true })
    .limit(BATCH_SIZE);

  let sent = 0;
  let failed = 0;

  for (const r of recipients || []) {
    const mapping = broadcast.variable_mapping || {};
    const bodyParams = Object.keys(mapping)
      .sort((a, b) => Number(a) - Number(b))
      .map((idx) => resolveVar(r.contact as Contact | null, mapping[idx]));

    try {
      const res = await sendTemplateMessage(
        r.phone,
        broadcast.template_name,
        broadcast.template_language,
        bodyParams
      );
      const wamid = res?.messages?.[0]?.id || null;
      await supabase
        .from("broadcast_recipients")
        .update({ status: "sent", whatsapp_msg_id: wamid, sent_at: new Date().toISOString() })
        .eq("id", r.id);
      sent++;
    } catch (err) {
      await supabase
        .from("broadcast_recipients")
        .update({ status: "failed", error: String(err) })
        .eq("id", r.id);
      failed++;
    }
    await sleep(DELAY_MS);
  }

  if (sent || failed) {
    await supabase
      .from("broadcasts")
      .update({ sent: broadcast.sent + sent, failed: broadcast.failed + failed })
      .eq("id", broadcastId);
  }

  const { count: remaining } = await supabase
    .from("broadcast_recipients")
    .select("id", { count: "exact", head: true })
    .eq("broadcast_id", broadcastId)
    .eq("status", "pending");

  if (!remaining) {
    await supabase.from("broadcasts").update({ status: "completed" }).eq("id", broadcastId);
  }

  return { sent, failed, remaining: remaining || 0 };
}

// Picks up broadcasts that are due (scheduled_at has passed) or were left
// mid-send (status "sending", e.g. a previous dispatch hit its time limit).
// Called by /api/cron/dispatch-broadcasts.
export async function dispatchDueBroadcasts() {
  const nowIso = new Date().toISOString();
  const { data: due } = await supabase
    .from("broadcasts")
    .select("id")
    .or(`status.eq.sending,and(status.eq.scheduled,scheduled_at.lte.${nowIso})`);

  let dispatched = 0;
  for (const b of due || []) {
    await dispatchBroadcast(b.id).catch((err) => console.error("dispatch failed:", b.id, err));
    dispatched++;
  }
  return dispatched;
}
