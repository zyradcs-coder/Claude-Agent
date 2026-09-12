import { NextRequest, after } from "next/server";
import { supabase } from "@/lib/supabase";
import { dispatchBroadcast } from "@/lib/broadcasts";

export const maxDuration = 60;

export async function GET() {
  const { data, error } = await supabase
    .from("broadcasts")
    .select("*")
    .order("created_at", { ascending: false });
  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json(data);
}

// POST /api/broadcasts - create a broadcast + its recipient list from a
// contact segment (tag filter, or all contacts). Sends immediately unless
// scheduled_at is set.
export async function POST(request: NextRequest) {
  const body = await request.json();
  if (!body.name?.trim() || !body.template_name) {
    return Response.json({ error: "name and template_name are required" }, { status: 400 });
  }

  let contactsQuery = supabase.from("contacts").select("id, phone_number");
  if (body.segment_tag) contactsQuery = contactsQuery.contains("tags", [body.segment_tag]);
  const { data: contacts, error: contactsError } = await contactsQuery;
  if (contactsError) return Response.json({ error: contactsError.message }, { status: 500 });
  if (!contacts?.length) {
    return Response.json({ error: "No contacts match this audience" }, { status: 400 });
  }

  const { data: broadcast, error } = await supabase
    .from("broadcasts")
    .insert({
      name: body.name.trim(),
      template_name: body.template_name,
      template_language: body.template_language || "en_US",
      variable_mapping: body.variable_mapping || {},
      segment_tag: body.segment_tag || null,
      scheduled_at: body.scheduled_at || null,
      status: body.scheduled_at ? "scheduled" : "sending",
      total: contacts.length,
    })
    .select()
    .single();
  if (error) return Response.json({ error: error.message }, { status: 500 });

  const recipients = contacts.map((c) => ({
    broadcast_id: broadcast.id,
    contact_id: c.id,
    phone: c.phone_number,
  }));
  const { error: recipientsError } = await supabase.from("broadcast_recipients").insert(recipients);
  if (recipientsError) {
    return Response.json({ error: recipientsError.message }, { status: 500 });
  }

  if (!body.scheduled_at) {
    // Send immediately - runs after the response so the request returns fast.
    after(() => dispatchBroadcast(broadcast.id));
  }

  return Response.json(broadcast, { status: 201 });
}
