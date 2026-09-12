import { NextRequest } from "next/server";
import { runIdleAutomations } from "@/lib/automations";

// Called by Vercel Cron (see vercel.json). Not behind the login middleware -
// protected instead by CRON_SECRET, which Vercel sends automatically as
// "Authorization: Bearer <CRON_SECRET>" when the env var is set.
export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const auth = request.headers.get("authorization");
    if (auth !== `Bearer ${secret}`) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  const fired = await runIdleAutomations();
  return Response.json({ ok: true, fired });
}
