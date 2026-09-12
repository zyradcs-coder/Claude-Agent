import { NextRequest } from "next/server";
import { supabase } from "@/lib/supabase";

// GET /api/contacts/[id] - profile + activity timeline (conversations + messages)
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  const { data: contact, error } = await supabase
    .from("contacts")
    .select("*")
    .eq("id", id)
    .single();
  if (error || !contact) {
    return Response.json({ error: "Not found" }, { status: 404 });
  }

  const { data: conversations } = await supabase
    .from("conversations")
    .select("id, phone, mode, updated_at, created_at")
    .eq("contact_id", id);

  const conversationIds = (conversations || []).map((c) => c.id);
  const { data: messages } = conversationIds.length
    ? await supabase
        .from("messages")
        .select("id, conversation_id, role, content, created_at")
        .in("conversation_id", conversationIds)
        .order("created_at", { ascending: false })
        .limit(50)
    : { data: [] };

  return Response.json({ contact, conversations: conversations || [], timeline: messages || [] });
}

// PATCH /api/contacts/[id] - update tags / custom_fields / name / email
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const body = await request.json();

  const update: Record<string, unknown> = {};
  if ("first_name" in body) update.first_name = body.first_name;
  if ("last_name" in body) update.last_name = body.last_name;
  if ("email" in body) update.email = body.email;
  if ("tags" in body && Array.isArray(body.tags)) update.tags = body.tags;
  if ("custom_fields" in body && typeof body.custom_fields === "object") {
    update.custom_fields = body.custom_fields;
  }

  const { data, error } = await supabase
    .from("contacts")
    .update(update)
    .eq("id", id)
    .select()
    .single();

  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json(data);
}
