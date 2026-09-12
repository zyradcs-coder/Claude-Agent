import { NextRequest } from "next/server";
import { supabase } from "@/lib/supabase";

// PATCH /api/deals/[id] - move stage (drag-drop), edit value/title/close date
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const body = await request.json();

  const update: Record<string, unknown> = {};
  if ("stage_id" in body) update.stage_id = body.stage_id;
  if ("title" in body) update.title = body.title;
  if ("value" in body) update.value = Number(body.value) || 0;
  if ("currency" in body) update.currency = body.currency;
  if ("expected_close_date" in body) update.expected_close_date = body.expected_close_date;
  if ("contact_id" in body) update.contact_id = body.contact_id;

  const { data, error } = await supabase
    .from("deals")
    .update(update)
    .eq("id", id)
    .select("*, contact:contacts(id, phone_number, first_name, last_name)")
    .single();

  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json(data);
}

// DELETE /api/deals/[id]
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const { error } = await supabase.from("deals").delete().eq("id", id);
  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ ok: true });
}
