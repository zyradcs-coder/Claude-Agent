import { NextRequest } from "next/server";
import { supabase } from "@/lib/supabase";
import { normalizePhone } from "@/lib/phone";

// GET /api/contacts?search=&tag=
export async function GET(request: NextRequest) {
  const search = request.nextUrl.searchParams.get("search")?.trim();
  const tag = request.nextUrl.searchParams.get("tag")?.trim();

  let query = supabase
    .from("contacts")
    .select("*")
    .order("updated_at", { ascending: false });

  if (search) {
    const like = `%${search}%`;
    query = query.or(
      `phone_number.ilike.${like},first_name.ilike.${like},last_name.ilike.${like},email.ilike.${like}`
    );
  }
  if (tag) {
    query = query.contains("tags", [tag]);
  }

  const { data, error } = await query;
  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json(data);
}

// POST /api/contacts - manual creation (CSV import calls this per row too)
export async function POST(request: NextRequest) {
  const body = await request.json();
  const phoneNumber = normalizePhone(body.phone_number || "");
  if (!phoneNumber) {
    return Response.json({ error: "phone_number is required" }, { status: 400 });
  }

  const { data, error } = await supabase
    .from("contacts")
    .insert({
      phone_number: phoneNumber,
      first_name: body.first_name || null,
      last_name: body.last_name || null,
      email: body.email || null,
      tags: Array.isArray(body.tags) ? body.tags : [],
      custom_fields: body.custom_fields || {},
    })
    .select()
    .single();

  if (error) {
    const status = error.code === "23505" ? 409 : 500;
    return Response.json({ error: error.message }, { status });
  }
  return Response.json(data, { status: 201 });
}
