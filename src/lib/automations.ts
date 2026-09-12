import { supabase } from "@/lib/supabase";
import { sendWhatsAppMessage } from "@/lib/whatsapp";
import type { Automation } from "@/lib/types";

interface RunContext {
  conversationId: string | null;
  contactId: string | null;
  phone: string | null;
  name: string | null;
}

function fillTemplate(template: string, ctx: RunContext): string {
  return template
    .replace(/\{\{\s*name\s*\}\}/gi, ctx.name || "there")
    .replace(/\{\{\s*phone\s*\}\}/gi, ctx.phone || "");
}

async function logRun(
  automationId: string,
  ctx: RunContext,
  status: "success" | "error" | "skipped",
  detail?: string
) {
  await supabase.from("automation_runs").insert({
    automation_id: automationId,
    conversation_id: ctx.conversationId,
    contact_id: ctx.contactId,
    status,
    detail: detail || null,
  });
}

async function executeAction(automation: Automation, ctx: RunContext) {
  const cfg = automation.action_config || {};

  switch (automation.action_type) {
    case "apply_tag": {
      const tag = String(cfg.tag || "").trim();
      if (!tag || !ctx.contactId) return logRun(automation.id, ctx, "skipped", "no tag or contact");
      const { data: contact } = await supabase
        .from("contacts")
        .select("tags")
        .eq("id", ctx.contactId)
        .single();
      const tags: string[] = contact?.tags || [];
      if (!tags.includes(tag)) {
        await supabase
          .from("contacts")
          .update({ tags: [...tags, tag] })
          .eq("id", ctx.contactId);
      }
      return logRun(automation.id, ctx, "success", `applied tag "${tag}"`);
    }

    case "assign_agent": {
      const agentId = String(cfg.agent_id || "");
      if (!agentId || !ctx.conversationId) {
        return logRun(automation.id, ctx, "skipped", "no agent or conversation");
      }
      await supabase
        .from("conversations")
        .update({ assigned_agent_id: agentId })
        .eq("id", ctx.conversationId);
      return logRun(automation.id, ctx, "success", `assigned agent ${agentId}`);
    }

    case "send_message": {
      const message = fillTemplate(String(cfg.message || ""), ctx);
      if (!message.trim() || !ctx.phone) {
        return logRun(automation.id, ctx, "skipped", "no message or phone");
      }
      try {
        await sendWhatsAppMessage(ctx.phone, message);
        if (ctx.conversationId) {
          await supabase.from("messages").insert({
            conversation_id: ctx.conversationId,
            role: "assistant",
            content: message,
            sender_type: "system",
          });
        }
        return logRun(automation.id, ctx, "success", message);
      } catch (err) {
        return logRun(automation.id, ctx, "error", String(err));
      }
    }

    case "move_stage": {
      const pipelineId = String(cfg.pipeline_id || "");
      const stageId = String(cfg.stage_id || "");
      if (!pipelineId || !stageId || !ctx.contactId) {
        return logRun(automation.id, ctx, "skipped", "no pipeline/stage/contact");
      }
      const { data: existing } = await supabase
        .from("deals")
        .select("id")
        .eq("pipeline_id", pipelineId)
        .eq("contact_id", ctx.contactId)
        .limit(1)
        .single();

      if (existing) {
        await supabase.from("deals").update({ stage_id: stageId }).eq("id", existing.id);
      } else {
        await supabase.from("deals").insert({
          pipeline_id: pipelineId,
          stage_id: stageId,
          contact_id: ctx.contactId,
          title: ctx.name || ctx.phone || "New deal",
        });
      }
      return logRun(automation.id, ctx, "success", `moved to stage ${stageId}`);
    }
  }
}

async function getEnabled(triggerType: Automation["trigger_type"]): Promise<Automation[]> {
  const { data } = await supabase
    .from("automations")
    .select("*")
    .eq("trigger_type", triggerType)
    .eq("enabled", true);
  return data || [];
}

// Fired right after a brand-new contact is created (not on every upsert).
export async function runNewContactAutomations(contact: {
  id: string;
  phone_number: string;
  first_name: string | null;
}) {
  const automations = await getEnabled("new_contact");
  const ctx: RunContext = {
    conversationId: null,
    contactId: contact.id,
    phone: contact.phone_number,
    name: contact.first_name,
  };
  for (const a of automations) {
    await executeAction(a, ctx).catch((err) => console.error("Automation failed:", a.id, err));
  }
}

// Fired on every inbound customer message.
export async function runKeywordAutomations(text: string, ctx: RunContext) {
  const automations = await getEnabled("keyword");
  const lower = text.toLowerCase();
  for (const a of automations) {
    const keyword = String(a.trigger_config?.keyword || "").toLowerCase().trim();
    if (!keyword || !lower.includes(keyword)) continue;
    await executeAction(a, ctx).catch((err) => console.error("Automation failed:", a.id, err));
  }
}

// Polled by /api/cron/check-idle. Dedupes so a given conversation only
// fires each idle automation once per idle window (i.e. not again until
// the customer sends a new message and updated_at moves forward).
export async function runIdleAutomations() {
  const automations = await getEnabled("conversation_idle");
  let fired = 0;

  for (const a of automations) {
    const hours = Number(a.trigger_config?.hours) || 24;
    const cutoff = new Date(Date.now() - hours * 60 * 60 * 1000).toISOString();

    const { data: idleConvos } = await supabase
      .from("conversations")
      .select("id, contact_id, phone, name, updated_at")
      .eq("status", "open")
      .lt("updated_at", cutoff);

    for (const convo of idleConvos || []) {
      const { data: lastRun } = await supabase
        .from("automation_runs")
        .select("created_at")
        .eq("automation_id", a.id)
        .eq("conversation_id", convo.id)
        .order("created_at", { ascending: false })
        .limit(1)
        .single();

      if (lastRun && lastRun.created_at > convo.updated_at) continue; // already fired this window

      const ctx: RunContext = {
        conversationId: convo.id,
        contactId: convo.contact_id,
        phone: convo.phone,
        name: convo.name,
      };
      await executeAction(a, ctx).catch((err) => console.error("Automation failed:", a.id, err));
      fired++;
    }
  }
  return fired;
}
