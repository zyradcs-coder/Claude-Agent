import { NextRequest } from "next/server";
import { supabase } from "@/lib/supabase";

const TRIGGER_TYPES = ["new_contact", "keyword", "conversation_idle"];
const ACTION_TYPES = ["apply_tag", "assign_agent", "send_message", "move_stage"];

export async function GET() {
  const { data, error } = await supabase
    .from("automations")
    .select("*")
    .order("created_at", { ascending: false });
  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json(data);
}

export async function POST(request: NextRequest) {
  const body = await request.json();
  if (!body.name?.trim()) return Response.json({ error: "name is required" }, { status: 400 });
  if (!TRIGGER_TYPES.includes(body.trigger_type)) {
    return Response.json({ error: "invalid trigger_type" }, { status: 400 });
  }
  if (!ACTION_TYPES.includes(body.action_type)) {
    return Response.json({ error: "invalid action_type" }, { status: 400 });
  }

  const { data, error } = await supabase
    .from("automations")
    .insert({
      name: body.name.trim(),
      trigger_type: body.trigger_type,
      trigger_config: body.trigger_config || {},
      action_type: body.action_type,
      action_config: body.action_config || {},
      enabled: body.enabled !== false,
    })
    .select()
    .single();

  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json(data, { status: 201 });
}
