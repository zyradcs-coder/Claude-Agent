import { supabase } from "@/lib/supabase";
import { embedText } from "@/lib/embeddings";

const CHUNK_SIZE = 800;
const CHUNK_OVERLAP = 100;

function chunkText(text: string): string[] {
  const clean = text.replace(/\r\n/g, "\n").trim();
  const chunks: string[] = [];
  let start = 0;
  while (start < clean.length) {
    const end = Math.min(start + CHUNK_SIZE, clean.length);
    chunks.push(clean.slice(start, end).trim());
    if (end === clean.length) break;
    start = end - CHUNK_OVERLAP;
  }
  return chunks.filter(Boolean);
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// Chunk, embed, and store a document. Runs in a background `after()` call
// from the upload route since embedding every chunk takes a few seconds.
export async function ingestDocument(documentId: string, content: string) {
  const chunks = chunkText(content);
  for (let i = 0; i < chunks.length; i++) {
    try {
      const embedding = await embedText(chunks[i]);
      await supabase.from("knowledge_chunks").insert({
        document_id: documentId,
        chunk_index: i,
        content: chunks[i],
        embedding,
      });
    } catch (err) {
      console.error(`Embedding failed for chunk ${i} of doc ${documentId}:`, err);
    }
    await sleep(150); // stay well under embedding API rate limits
  }
}

// Top-k relevant chunks for a query, joined into one context block.
// Returns "" if there's no knowledge base yet or embedding fails -
// callers should treat that as "no extra context", not an error.
export async function retrieveContext(query: string, matchCount = 4): Promise<string> {
  try {
    const embedding = await embedText(query);
    const { data, error } = await supabase.rpc("match_knowledge_chunks", {
      query_embedding: embedding,
      match_count: matchCount,
    });
    if (error || !data?.length) return "";
    return data
      .filter((c: { similarity: number }) => c.similarity > 0.5)
      .map((c: { content: string }) => c.content)
      .join("\n---\n");
  } catch (err) {
    console.error("RAG retrieval failed:", err);
    return "";
  }
}
