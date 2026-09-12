import { supabase } from "@/lib/supabase";

// GET /api/broadcasts/[id] - broadcast metrics + recipient rows (delivery detail)
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const { data: broadcast, error } = await supabase
    .from("broadcasts")
    .select("*")
    .eq("id", id)
    .single();
  if (error || !broadcast) return Response.json({ error: "Not found" }, { status: 404 });

  const { data: recipients } = await supabase
    .from("broadcast_recipients")
    .select("*, contact:contacts(id, phone_number, first_name, last_name)")
    .eq("broadcast_id", id)
    .order("created_at", { ascending: true })
    .limit(500);

  return Response.json({ broadcast, recipients: recipients || [] });
}
