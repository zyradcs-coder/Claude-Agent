import OpenAI from "openai";
import { SYSTEM_PROMPT } from "@/lib/system-prompt";

// Prefer calling Google's Gemini API directly (free tier with real limits).
// Fall back to OpenRouter if only that key is configured.
const usingGemini = Boolean(process.env.GEMINI_API_KEY);

const openai = new OpenAI({
  baseURL: usingGemini
    ? "https://generativelanguage.googleapis.com/v1beta/openai"
    : process.env.OPENROUTER_API_KEY
      ? "https://openrouter.ai/api/v1"
      : "https://gateway.ngrok.ai/v1",
  apiKey:
    process.env.GEMINI_API_KEY ||
    process.env.OPENROUTER_API_KEY ||
    process.env.AI_GATEWAY_API_KEY ||
    "missing-api-key",
  timeout: 60_000,
  maxRetries: 0,
});

const defaultModel = usingGemini
  ? "gemini-flash-latest"
  : "google/gemma-4-31b-it:free";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function getAIResponse(
  messages: { role: "user" | "assistant"; content: string }[]
) {
  const model = process.env.AI_MODEL || defaultModel;

  // Retry transient rate limits / provider hiccups with backoff.
  let lastError: unknown;
  for (let attempt = 0; attempt < 4; attempt++) {
    try {
      const completion = await openai.chat.completions.create({
        model,
        messages: [{ role: "system", content: SYSTEM_PROMPT }, ...messages],
        // Gemini 2.5 Flash "thinks" before answering by default, adding ~30s.
        // Disable it for fast, chat-appropriate replies.
        ...(usingGemini ? { reasoning_effort: "none" as const } : {}),
      });
      const content = completion.choices[0]?.message?.content;
      if (content) return content;
      throw new Error("Empty completion");
    } catch (error) {
      lastError = error;
      const status = (error as { status?: number })?.status;
      if (status === 429 || status === 503) {
        await sleep(1500 * (attempt + 1));
        continue;
      }
      throw error;
    }
  }
  throw lastError;
}
