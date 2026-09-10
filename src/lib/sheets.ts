// Fire-and-forget logging to a Google Sheet via an Apps Script Web App.
// Never throws into the caller - a failed log must not break a reply.
export async function logToSheet(payload: {
  phone: string;
  name: string | null;
  direction: "inbound" | "outbound";
  text: string;
  language?: string;
  status?: "bot" | "needs-human";
}) {
  const url = process.env.SHEETS_WEBAPP_URL;
  if (!url) return;

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        type: "message",
        secret: process.env.SHEETS_WEBAPP_SECRET || "",
        ...payload,
      }),
    });
    if (!res.ok) {
      console.error("Sheet log failed:", res.status, await res.text());
    }
  } catch (err) {
    console.error("Sheet log error:", err);
  }
}
