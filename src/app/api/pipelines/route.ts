import { supabase } from "@/lib/supabase";

// GET /api/pipelines - pipelines with their stages (ordered), for the board
export async function GET() {
  const { data: pipelines, error } = await supabase
    .from("pipelines")
    .select("*")
    .order("created_at", { ascending: true });
  if (error) return Response.json({ error: error.message }, { status: 500 });

  const { data: stages, error: stagesError } = await supabase
    .from("pipeline_stages")
    .select("*")
    .order("order_weight", { ascending: true });
  if (stagesError) return Response.json({ error: stagesError.message }, { status: 500 });

  const withStages = (pipelines || []).map((p) => ({
    ...p,
    stages: (stages || []).filter((s) => s.pipeline_id === p.id),
  }));

  return Response.json(withStages);
}
