import { NextRequest } from "next/server";
import { getAnalytics } from "@/lib/analytics";

export async function GET(request: NextRequest) {
  const range = Number(request.nextUrl.searchParams.get("days")) || 14;
  try {
    const data = await getAnalytics(Math.min(Math.max(range, 1), 90));
    return Response.json(data);
  } catch (err) {
    return Response.json({ error: String(err) }, { status: 500 });
  }
}
