import { NextRequest, after } from "next/server";
import { supabase } from "@/lib/supabase";
import { sendWhatsAppMessage } from "@/lib/whatsapp";
import { getAIResponse } from "@/lib/ai";

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
  const body = await request.json();

  // Only process whatsapp_business_account events
  if (body.object !== "whatsapp_business_account") {
    return Response.json({ status: "ignored" });
  }

  const entry = body.entry?.[0];
  const changes = entry?.changes?.[0];
  const value = changes?.value;
  const message = value?.messages?.[0];

  // Only process actual text messages (not status updates or other types)
  if (!message) {
    return Response.json({ status: "no_message" });
  }
  if (message.type !== "text") {
    return Response.json({ status: "non_text" });
  }

  const payload = {
    phone: message.from as string,
    text: message.text.body as string,
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
  name,
  whatsappMsgId,
}: {
  phone: string;
  text: string;
  name: string | null;
  whatsappMsgId: string;
}) {
  try {
    // Find or create conversation
    let { data: conversation } = await supabase
      .from("conversations")
      .select("*")
      .eq("phone", phone)
      .single();

    if (!conversation) {
      const { data: newConvo } = await supabase
        .from("conversations")
        .insert({ phone, name })
        .select()
        .single();
      conversation = newConvo;
    } else if (name && name !== conversation.name) {
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
      whatsapp_msg_id: whatsappMsgId,
    });

    if (insertError?.code === "23505") {
      // Duplicate message (Meta retry), already handled
      return;
    }

    // Update conversation timestamp
    await supabase
      .from("conversations")
      .update({ updated_at: new Date().toISOString() })
      .eq("id", conversation.id);

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

    // Get AI response
    const aiResponse = await getAIResponse(
      (history || []).map((m) => ({
        role: m.role as "user" | "assistant",
        content: m.content,
      }))
    );

    // Store AI response first so it shows in the dashboard even if delivery fails
    await supabase.from("messages").insert({
      conversation_id: conversation.id,
      role: "assistant",
      content: aiResponse,
    });

    // Update conversation timestamp again
    await supabase
      .from("conversations")
      .update({ updated_at: new Date().toISOString() })
      .eq("id", conversation.id);

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
