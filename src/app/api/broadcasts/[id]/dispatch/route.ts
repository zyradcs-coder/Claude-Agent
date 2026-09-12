import { dispatchBroadcast } from "@/lib/broadcasts";

export const maxDuration = 60;

// POST /api/broadcasts/[id]/dispatch - "Send now" / "Continue sending".
// Safe to call repeatedly - resumes from wherever the last batch stopped.
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const result = await dispatchBroadcast(id);
  return Response.json(result);
}
