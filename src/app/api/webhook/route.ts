import { NextRequest, after } from "next/server";
import { createHmac, timingSafeEqual } from "crypto";
import { supabase } from "@/lib/supabase";
import { sendWhatsAppMessage, downloadWhatsAppMedia } from "@/lib/whatsapp";
import { getAIResponse, transcribeAudio } from "@/lib/ai";
import { logToSheet } from "@/lib/sheets";
import { upsertContact } from "@/lib/contacts";
import { runKeywordAutomations } from "@/lib/automations";
import { retrieveContext } from "@/lib/rag";

// Simple heuristic: customer explicitly asking for a person. Not
// exhaustive by design - a false negative just means the bot answers
// (fine); a false positive just hands off a bit early (also fine).
const HUMAN_REQUEST = /\b(human|agent|representative|real person|talk to (a |someone)|speak to (a |someone))\b/i;

const STATUS_RANK: Record<string, number> = { sent: 1, delivered: 2, read: 3, failed: 4 };

// Meta delivery-status callbacks (sent/delivered/read/failed) for messages
// this app sent - currently only broadcast recipients are tracked by
// whatsapp_msg_id, so unmatched statuses (e.g. AI replies) are no-ops.
async function updateBroadcastStatuses(
  statuses: Array<{ id: string; status: string; timestamp?: string }>
) {
  for (const s of statuses) {
    const { data: recipient } = await supabase
      .from("broadcast_recipients")
      .select("id, broadcast_id, status")
      .eq("whatsapp_msg_id", s.id)
      .single();
    if (!recipient) continue;

    const newRank = STATUS_RANK[s.status] || 0;
    const currentRank = STATUS_RANK[recipient.status] || 0;
    if (newRank <= currentRank) continue; // ignore out-of-order/duplicate callbacks

    const timestampField =
      s.status === "delivered" ? "delivered_at" : s.status === "read" ? "read_at" : null;
    await supabase
      .from("broadcast_recipients")
      .update({
        status: s.status,
        ...(timestampField ? { [timestampField]: new Date().toISOString() } : {}),
      })
      .eq("id", recipient.id);

    if (s.status === "delivered" || s.status === "read") {
      const { data: broadcast } = await supabase
        .from("broadcasts")
        .select("delivered, read")
        .eq("id", recipient.broadcast_id)
        .single();
      const current: number = (broadcast as { delivered: number; read: number } | null)?.[
        s.status as "delivered" | "read"
      ] || 0;
      await supabase
        .from("broadcasts")
        .update({ [s.status]: current + 1 })
        .eq("id", recipient.broadcast_id);
    }
  }
}

// Verify Meta's X-Hub-Signature-256 header against the raw body.
// Only enforced when WHATSAPP_APP_SECRET is set.
function isValidSignature(rawBody: string, header: string | null): boolean {
  const secret = process.env.WHATSAPP_APP_SECRET;
  if (!secret) return true;
  if (!header?.startsWith("sha256=")) return false;

  const expected = createHmac("sha256", secret).update(rawBody).digest("hex");
  const received = header.slice("sha256=".length);
  const a = Buffer.from(expected, "hex");
  const b = Buffer.from(received, "hex");
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const mode = searchParams.get("hub.mode");
  const token = searchParams.get("hub.verify_token");
  const challenge = searchParams.get("hub.challenge");

  if (mode === "subscribe" && token === process.env.WHATSAPP_VERIFY_TOKEN) {
    return new Response(challenge, { status: 200 });
  }

  return new Response("Forbidden", { status: 403 });
}

export async function POST(request: NextRequest) {
  const rawBody = await request.text();

  if (!isValidSignature(rawBody, request.headers.get("x-hub-signature-256"))) {
    return new Response("Invalid signature", { status: 401 });
  }

  let body;
  try {
    body = JSON.parse(rawBody);
  } catch {
    return new Response("Bad request", { status: 400 });
  }

  // Only process whatsapp_business_account events
  if (body.object !== "whatsapp_business_account") {
    return Response.json({ status: "ignored" });
  }

  const entry = body.entry?.[0];
  const changes = entry?.changes?.[0];
  const value = changes?.value;
  const message = value?.messages?.[0];
  const statuses = value?.statuses;

  if (statuses?.length) {
    after(() => updateBroadcastStatuses(statuses));
    return Response.json({ status: "status_update" });
  }

  // Only process actual text messages (not status updates or other types)
  if (!message) {
    return Response.json({ status: "no_message" });
  }
  // Text and voice notes are handled; ignore other types (images, stickers…)
  if (message.type !== "text" && message.type !== "audio") {
    return Response.json({ status: "non_text" });
  }

  const payload = {
    phone: message.from as string,
    text: message.type === "text" ? (message.text.body as string) : null,
    audioId: message.type === "audio" ? (message.audio.id as string) : null,
    name: (value.contacts?.[0]?.profile?.name as string) || null,
    whatsappMsgId: message.id as string,
  };

  // Acknowledge Meta immediately (must respond within ~5s), then do the
  // AI reply after the response has been sent.
  after(() => processMessage(payload));

  return Response.json({ status: "received" });
}

async function processMessage({
  phone,
  text,
  audioId,
  name,
  whatsappMsgId,
}: {
  phone: string;
  text: string | null;
  audioId: string | null;
  name: string | null;
  whatsappMsgId: string;
}) {
  try {
    // Voice note: download and transcribe it into text
    if (audioId) {
      try {
        const { base64, mimeType } = await downloadWhatsAppMedia(audioId);
        text = await transcribeAudio(base64, mimeType);
      } catch (err) {
        console.error("Voice transcription failed:", err);
      }
      if (!text) {
        await sendWhatsAppMessage(
          phone,
          "Sorry, I couldn't make out that voice message. Could you send it again or type it out?"
        );
        return;
      }
    }

    if (!text) return;

    // Dedup into Contact Hub (matches by normalized phone across channels).
    // Non-fatal: if the contacts table/migration isn't in place yet, the
    // conversation still gets created and the AI still replies.
    const contact = await upsertContact(phone, name).catch((err) => {
      console.error("Contact upsert failed:", err);
      return null;
    });

    // Find or create conversation
    let { data: conversation } = await supabase
      .from("conversations")
      .select("*")
      .eq("phone", phone)
      .single();

    if (!conversation) {
      const { data: newConvo } = await supabase
        .from("conversations")
        .insert({ phone, name, contact_id: contact?.id ?? null })
        .select()
        .single();
      conversation = newConvo;
    } else if (!conversation.contact_id && contact) {
      await supabase
        .from("conversations")
        .update({ contact_id: contact.id })
        .eq("id", conversation.id);
      conversation.contact_id = contact.id;
    }

    if (conversation && name && name !== conversation.name) {
      await supabase
        .from("conversations")
        .update({ name })
        .eq("id", conversation.id);
    }

    if (!conversation) {
      console.error("Webhook: failed to create conversation for", phone);
      return;
    }

    // Store user message (ignore duplicates)
    const { error: insertError } = await supabase.from("messages").insert({
      conversation_id: conversation.id,
      role: "user",
      content: text,
      sender_type: "customer",
      whatsapp_msg_id: whatsappMsgId,
    });

    if (insertError?.code === "23505") {
      // Duplicate message (Meta retry), already handled
      return;
    }

    // A new customer message reopens a pending/closed conversation so it
    // resurfaces in the shared inbox.
    await supabase
      .from("conversations")
      .update({ updated_at: new Date().toISOString(), status: "open" })
      .eq("id", conversation.id);

    // Log the inbound message to the Google Sheet
    await logToSheet({
      phone,
      name: name ?? conversation.name ?? null,
      direction: "inbound",
      text,
      status: conversation.mode === "human" ? "needs-human" : "bot",
    });

    // Keyword-triggered automations (apply tag, assign agent, auto-reply, move stage)
    await runKeywordAutomations(text, {
      conversationId: conversation.id,
      contactId: contact?.id ?? conversation.contact_id ?? null,
      phone,
      name: name ?? conversation.name ?? null,
    }).catch((err) => console.error("keyword automations failed:", err));

    // Customer explicitly asked for a person - hand off instead of replying.
    if (HUMAN_REQUEST.test(text)) {
      await supabase.from("conversations").update({ mode: "human" }).eq("id", conversation.id);
      await supabase.from("internal_notes").insert({
        conversation_id: conversation.id,
        body: "Customer asked to speak with a human - bot paused automatically.",
      });
      return;
    }

    // If mode is 'human', don't auto-reply
    if (conversation.mode === "human") {
      return;
    }

    // Fetch conversation history (last 20 messages for context)
    const { data: history } = await supabase
      .from("messages")
      .select("role, content")
      .eq("conversation_id", conversation.id)
      .order("created_at", { ascending: true })
      .limit(20);

    // RAG: ground the reply in the uploaded knowledge base, if any matches
    const knowledgeContext = await retrieveContext(text).catch(() => "");

    // Get AI response
    const aiResponse = await getAIResponse(
      (history || []).map((m) => ({
        role: m.role as "user" | "assistant",
        content: m.content,
      })),
      { knowledgeContext }
    );

    // Store AI response first so it shows in the dashboard even if delivery fails
    await supabase.from("messages").insert({
      conversation_id: conversation.id,
      role: "assistant",
      content: aiResponse,
      sender_type: "system",
    });

    // Update conversation timestamp again
    await supabase
      .from("conversations")
      .update({ updated_at: new Date().toISOString() })
      .eq("id", conversation.id);

    // Log the bot's reply to the Google Sheet (before send, so it's recorded
    // even if WhatsApp delivery fails)
    await logToSheet({
      phone,
      name: name ?? conversation.name ?? null,
      direction: "outbound",
      text: aiResponse,
      status: "bot",
    });

    // Send response via WhatsApp
    await sendWhatsAppMessage(phone, aiResponse);
  } catch (error) {
    console.error("Webhook processing error:", error);
    try {
      await sendWhatsAppMessage(
        phone,
        "Thanks for your message. One of our coordinators will follow up with you shortly."
      );
    } catch (fallbackError) {
      console.error("Fallback message failed:", fallbackError);
    }
  }
}
