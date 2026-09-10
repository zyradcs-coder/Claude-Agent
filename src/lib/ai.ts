import OpenAI from "openai";
import { SYSTEM_PROMPT } from "@/lib/system-prompt";

// Provider priority: Groq (fast, generous free tier) -> Gemini -> OpenRouter.
type Provider = "groq" | "gemini" | "openrouter";

const provider: Provider = process.env.GROQ_API_KEY
  ? "groq"
  : process.env.GEMINI_API_KEY
    ? "gemini"
    : "openrouter";

const config = {
  groq: {
    baseURL: "https://api.groq.com/openai/v1",
    apiKey: process.env.GROQ_API_KEY,
    model: "llama-3.3-70b-versatile",
  },
  gemini: {
    baseURL: "https://generativelanguage.googleapis.com/v1beta/openai",
    apiKey: process.env.GEMINI_API_KEY,
    model: "gemini-flash-latest",
  },
  openrouter: {
    baseURL: "https://openrouter.ai/api/v1",
    apiKey: process.env.OPENROUTER_API_KEY || "missing-api-key",
    model: "google/gemma-4-31b-it:free",
  },
}[provider];

const openai = new OpenAI({
  baseURL: config.baseURL,
  apiKey: config.apiKey || "missing-api-key",
  timeout: 60_000,
  maxRetries: 0,
});

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// Transcribe a WhatsApp voice note.
export async function transcribeAudio(
  base64: string,
  mimeType: string
): Promise<string> {
  const audio = Buffer.from(base64, "base64");
  const ext = (mimeType.split(";")[0].split("/")[1] || "ogg").trim();

  // Groq: Whisper via multipart transcription endpoint.
  if (process.env.GROQ_API_KEY) {
    const form = new FormData();
    form.append("file", new Blob([new Uint8Array(audio)]), `voice.${ext}`);
    form.append("model", "whisper-large-v3-turbo");
    const res = await fetch(
      "https://api.groq.com/openai/v1/audio/transcriptions",
      {
        method: "POST",
        headers: { Authorization: `Bearer ${process.env.GROQ_API_KEY}` },
        body: form,
      }
    );
    const data = await res.json();
    if (!res.ok) throw new Error(`Transcription failed: ${JSON.stringify(data)}`);
    return (data.text || "").trim();
  }

  // Gemini: native audio understanding.
  if (process.env.GEMINI_API_KEY) {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-latest:generateContent?key=${process.env.GEMINI_API_KEY}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [
            {
              parts: [
                {
                  text: "Transcribe this voice message verbatim. Output only the spoken words, in the original language.",
                },
                {
                  inline_data: {
                    mime_type: mimeType.split(";")[0].trim(),
                    data: base64,
                  },
                },
              ],
            },
          ],
        }),
      }
    );
    const data = await res.json();
    if (!res.ok) throw new Error(`Transcription failed: ${JSON.stringify(data)}`);
    return (
      data.candidates?.[0]?.content?.parts
        ?.map((p: { text?: string }) => p.text || "")
        .join("")
        .trim() || ""
    );
  }

  throw new Error("No transcription-capable AI key configured (GROQ_API_KEY or GEMINI_API_KEY)");
}

export async function getAIResponse(
  messages: { role: "user" | "assistant"; content: string }[]
) {
  const model = process.env.AI_MODEL || config.model;

  let lastError: unknown;
  for (let attempt = 0; attempt < 4; attempt++) {
    try {
      const completion = await openai.chat.completions.create({
        model,
        messages: [{ role: "system", content: SYSTEM_PROMPT }, ...messages],
        ...(provider === "gemini" ? { reasoning_effort: "none" as const } : {}),
      });
      const content = completion.choices[0]?.message?.content;
      if (content) return content;
      throw new Error("Empty completion");
    } catch (error) {
      lastError = error;
      const status = (error as { status?: number })?.status;
      const code = (error as { code?: number })?.code;
      const msg = String((error as { message?: string })?.message || "");
      const retriable =
        status === 429 ||
        status === 503 ||
        code === 429 ||
        code === 503 ||
        /429|rate.?limit|quota|RESOURCE_EXHAUSTED|overloaded|unavailable/i.test(msg);
      if (retriable && attempt < 3) {
        await sleep(2000 * (attempt + 1));
        continue;
      }
      throw error;
    }
  }
  throw lastError;
}
