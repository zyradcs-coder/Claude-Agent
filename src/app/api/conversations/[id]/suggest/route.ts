import { supabase } from "@/lib/supabase";
import { getAIResponse } from "@/lib/ai";
import { retrieveContext } from "@/lib/rag";

// POST /api/conversations/[id]/suggest - Agent Assist: draft a reply from
// the last few messages (+ knowledge base) without sending or storing it.
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  const { data: history } = await supabase
    .from("messages")
    .select("role, content")
    .eq("conversation_id", id)
    .order("created_at", { ascending: false })
    .limit(10);

  const ordered = (history || []).reverse();
  const lastCustomerMsg = [...ordered].reverse().find((m) => m.role === "user")?.content || "";
  const knowledgeContext = await retrieveContext(lastCustomerMsg).catch(() => "");

  try {
    const draft = await getAIResponse(
      ordered.map((m) => ({ role: m.role as "user" | "assistant", content: m.content })),
      { knowledgeContext }
    );
    return Response.json({ draft });
  } catch (err) {
    return Response.json({ error: String(err) }, { status: 500 });
  }
}
