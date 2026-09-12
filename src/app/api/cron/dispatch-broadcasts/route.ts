import { NextRequest } from "next/server";
import { dispatchDueBroadcasts } from "@/lib/broadcasts";

export const maxDuration = 60;

// Called by Vercel Cron (vercel.json). Same CRON_SECRET pattern as
// /api/cron/check-idle. On the Hobby plan this runs once a day - "Send now"
// in the UI is the reliable path for anything time-sensitive.
export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const auth = request.headers.get("authorization");
    if (auth !== `Bearer ${secret}`) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  const dispatched = await dispatchDueBroadcasts();
  return Response.json({ ok: true, dispatched });
}
