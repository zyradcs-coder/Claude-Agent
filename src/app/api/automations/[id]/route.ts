import { NextRequest } from "next/server";
import { supabase } from "@/lib/supabase";

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const body = await request.json();

  const update: Record<string, unknown> = {};
  if ("name" in body) update.name = body.name;
  if ("trigger_type" in body) update.trigger_type = body.trigger_type;
  if ("trigger_config" in body) update.trigger_config = body.trigger_config;
  if ("action_type" in body) update.action_type = body.action_type;
  if ("action_config" in body) update.action_config = body.action_config;
  if ("enabled" in body) update.enabled = body.enabled;

  const { data, error } = await supabase
    .from("automations")
    .update(update)
    .eq("id", id)
    .select()
    .single();

  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json(data);
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const { error } = await supabase.from("automations").delete().eq("id", id);
  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ ok: true });
}
