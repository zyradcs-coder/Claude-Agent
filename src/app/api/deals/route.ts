import { NextRequest } from "next/server";
import { supabase } from "@/lib/supabase";

// GET /api/deals?pipeline_id= - deals with their linked contact
export async function GET(request: NextRequest) {
  const pipelineId = request.nextUrl.searchParams.get("pipeline_id");

  let query = supabase
    .from("deals")
    .select("*, contact:contacts(id, phone_number, first_name, last_name)")
    .order("created_at", { ascending: false });
  if (pipelineId) query = query.eq("pipeline_id", pipelineId);

  const { data, error } = await query;
  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json(data);
}

// POST /api/deals - create a deal
export async function POST(request: NextRequest) {
  const body = await request.json();
  if (!body.pipeline_id || !body.stage_id || !body.title?.trim()) {
    return Response.json(
      { error: "pipeline_id, stage_id and title are required" },
      { status: 400 }
    );
  }

  const { data, error } = await supabase
    .from("deals")
    .insert({
      pipeline_id: body.pipeline_id,
      stage_id: body.stage_id,
      contact_id: body.contact_id || null,
      title: body.title.trim(),
      value: Number(body.value) || 0,
      currency: body.currency || "AED",
      expected_close_date: body.expected_close_date || null,
    })
    .select("*, contact:contacts(id, phone_number, first_name, last_name)")
    .single();

  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json(data, { status: 201 });
}
