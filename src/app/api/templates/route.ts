import { listMessageTemplates } from "@/lib/whatsapp";

// GET /api/templates - live list of Meta-approved message templates.
// Broadcasts can only use these (Meta blocks free text outside the 24h
// service window), so the UI picks from this list, not free-typed text.
export async function GET() {
  try {
    const templates = await listMessageTemplates();
    return Response.json(templates);
  } catch (err) {
    return Response.json({ error: String(err) }, { status: 500 });
  }
}
