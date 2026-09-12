import { NextRequest, after } from "next/server";
import { supabase } from "@/lib/supabase";
import { ingestDocument } from "@/lib/rag";

export const maxDuration = 60;

// GET /api/knowledge - documents with their chunk count
export async function GET() {
  const { data: docs, error } = await supabase
    .from("knowledge_documents")
    .select("*")
    .order("created_at", { ascending: false });
  if (error) return Response.json({ error: error.message }, { status: 500 });

  const { data: chunks } = await supabase.from("knowledge_chunks").select("document_id");
  const counts = new Map<string, number>();
  for (const c of chunks || []) counts.set(c.document_id, (counts.get(c.document_id) || 0) + 1);

  return Response.json((docs || []).map((d) => ({ ...d, chunk_count: counts.get(d.id) || 0 })));
}

// POST /api/knowledge - upload a .txt/.md/.pdf file (multipart) or paste
// text directly (JSON: {name, content}). Embedding runs in the background.
export async function POST(request: NextRequest) {
  const contentType = request.headers.get("content-type") || "";
  let name: string;
  let content: string;
  let sourceType: "paste" | "upload" = "paste";

  if (contentType.includes("multipart/form-data")) {
    const form = await request.formData();
    const file = form.get("file") as File | null;
    if (!file) return Response.json({ error: "file is required" }, { status: 400 });
    name = file.name;
    sourceType = "upload";

    if (file.name.toLowerCase().endsWith(".pdf")) {
      const { PDFParse } = await import("pdf-parse");
      const buffer = Buffer.from(await file.arrayBuffer());
      const parser = new PDFParse({ data: buffer });
      const result = await parser.getText();
      await parser.destroy();
      content = result.text;
    } else {
      content = await file.text();
    }
  } else {
    const body = await request.json();
    if (!body.name?.trim() || !body.content?.trim()) {
      return Response.json({ error: "name and content are required" }, { status: 400 });
    }
    name = body.name.trim();
    content = body.content;
  }

  if (!content.trim()) {
    return Response.json({ error: "Document has no extractable text" }, { status: 400 });
  }

  const { data: doc, error } = await supabase
    .from("knowledge_documents")
    .insert({ name, source_type: sourceType })
    .select()
    .single();
  if (error) return Response.json({ error: error.message }, { status: 500 });

  after(() => ingestDocument(doc.id, content));

  return Response.json(doc, { status: 201 });
}
