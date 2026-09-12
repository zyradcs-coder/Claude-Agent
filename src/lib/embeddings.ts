import { getSetting } from "@/lib/settings";

// Gemini's text-embedding-004 (768-dim) - matches the `vector(768)` column
// in knowledge_chunks. Uses the BYOK key if one is set, else the shared one.
export async function embedText(text: string): Promise<number[]> {
  const key = (await getSetting("gemini_api_key").catch(() => null)) || process.env.GEMINI_API_KEY;
  if (!key) throw new Error("No Gemini API key configured for embeddings");

  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/text-embedding-004:embedContent?key=${key}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content: { parts: [{ text }] } }),
    }
  );
  const data = await res.json();
  if (!res.ok) throw new Error(`Embedding failed: ${JSON.stringify(data)}`);
  return data.embedding.values as number[];
}
