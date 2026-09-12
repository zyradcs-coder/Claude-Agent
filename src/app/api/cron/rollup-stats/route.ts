import { NextRequest } from "next/server";
import { rollupDay } from "@/lib/analytics";

// Called by Vercel Cron (vercel.json), same CRON_SECRET pattern as the
// other cron routes. Rolls up "yesterday" (the last fully-completed UTC
// day) into daily_stats so analytics history reads a pre-aggregated row
// instead of re-scanning raw tables.
export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const auth = request.headers.get("authorization");
    if (auth !== `Bearer ${secret}`) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
  await rollupDay(yesterday);
  return Response.json({ ok: true, rolledUp: yesterday });
}
