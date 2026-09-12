// Download a media object (voice note, image, etc.) sent by a customer.
// Meta gives a short-lived URL that still requires the access token to fetch.
export async function downloadWhatsAppMedia(
  mediaId: string
): Promise<{ base64: string; mimeType: string }> {
  const metaRes = await fetch(`https://graph.facebook.com/v22.0/${mediaId}`, {
    headers: { Authorization: `Bearer ${process.env.WHATSAPP_ACCESS_TOKEN}` },
  });
  const meta = await metaRes.json();
  if (!metaRes.ok || !meta.url) {
    throw new Error(`Media lookup failed: ${JSON.stringify(meta)}`);
  }

  const binRes = await fetch(meta.url, {
    headers: { Authorization: `Bearer ${process.env.WHATSAPP_ACCESS_TOKEN}` },
  });
  if (!binRes.ok) {
    throw new Error(`Media download failed (${binRes.status})`);
  }

  const base64 = Buffer.from(await binRes.arrayBuffer()).toString("base64");
  return { base64, mimeType: (meta.mime_type as string) || "audio/ogg" };
}

export interface WhatsAppTemplate {
  id: string;
  name: string;
  status: string;
  language: string;
  category: string;
  components: Array<{ type: string; format?: string; text?: string }>;
}

// List Meta-approved message templates for the configured WABA. Broadcasts
// to customers outside the 24h service window must use one of these -
// Meta blocks arbitrary free text for that case.
export async function listMessageTemplates(): Promise<WhatsAppTemplate[]> {
  const res = await fetch(
    `https://graph.facebook.com/v22.0/${process.env.WHATSAPP_WABA_ID}/message_templates?fields=name,status,language,category,components&limit=100`,
    { headers: { Authorization: `Bearer ${process.env.WHATSAPP_ACCESS_TOKEN}` } }
  );
  const data = await res.json();
  if (!res.ok) throw new Error(`Template list failed: ${JSON.stringify(data)}`);
  return (data.data || []).filter((t: WhatsAppTemplate) => t.status === "APPROVED");
}

// Send an approved template message with positional body variables
// (Meta templates use {{1}}, {{2}}, ... in the BODY component).
export async function sendTemplateMessage(
  to: string,
  templateName: string,
  language: string,
  bodyParams: string[]
) {
  const components =
    bodyParams.length > 0
      ? [
          {
            type: "body",
            parameters: bodyParams.map((text) => ({ type: "text", text })),
          },
        ]
      : [];

  const res = await fetch(
    `https://graph.facebook.com/v22.0/${process.env.WHATSAPP_PHONE_NUMBER_ID}/messages`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.WHATSAPP_ACCESS_TOKEN}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        to,
        type: "template",
        template: {
          name: templateName,
          language: { code: language },
          components,
        },
      }),
    }
  );

  const data = await res.json();
  if (!res.ok) {
    throw new Error(`Template send failed (${res.status}): ${data?.error?.message || JSON.stringify(data)}`);
  }
  return data;
}

export async function sendWhatsAppMessage(to: string, body: string) {
  const res = await fetch(
    `https://graph.facebook.com/v22.0/${process.env.WHATSAPP_PHONE_NUMBER_ID}/messages`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.WHATSAPP_ACCESS_TOKEN}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        to,
        type: "text",
        text: { body },
      }),
    }
  );

  const data = await res.json();
  if (!res.ok) {
    console.error("WhatsApp send failed:", res.status, JSON.stringify(data));
    throw new Error(
      `WhatsApp send failed (${res.status}): ${data?.error?.message || "unknown error"}`
    );
  }
  return data;
}
