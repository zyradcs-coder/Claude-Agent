import { runIdleAutomations } from "@/lib/automations";

// POST /api/automations/run-idle-check - manual "run now" from the dashboard.
// Behind the normal auth middleware (unlike /api/cron/check-idle, which
// Vercel Cron calls once a day on the Hobby plan).
export async function POST() {
  const fired = await runIdleAutomations();
  return Response.json({ ok: true, fired });
}
