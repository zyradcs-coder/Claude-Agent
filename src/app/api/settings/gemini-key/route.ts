import { NextRequest } from "next/server";
import { getSetting, setSetting, deleteSetting } from "@/lib/settings";

// GET - whether a BYOK key is set (never returns the key itself)
export async function GET() {
  const key = await getSetting("gemini_api_key");
  return Response.json({ configured: Boolean(key) });
}

// POST - set/replace the BYOK key
export async function POST(request: NextRequest) {
  const body = await request.json();
  if (!body.key?.trim()) return Response.json({ error: "key is required" }, { status: 400 });
  await setSetting("gemini_api_key", body.key.trim());
  return Response.json({ configured: true });
}

// DELETE - fall back to the shared key
export async function DELETE() {
  await deleteSetting("gemini_api_key");
  return Response.json({ configured: false });
}
