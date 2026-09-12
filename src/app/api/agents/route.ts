import { supabase } from "@/lib/supabase";

// GET /api/agents - teammates available to claim/assign conversations
export async function GET() {
  const { data, error } = await supabase
    .from("profiles")
    .select("*")
    .order("display_name", { ascending: true });

  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json(data);
}
