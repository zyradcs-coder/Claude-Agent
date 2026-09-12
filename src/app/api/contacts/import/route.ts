import { NextRequest } from "next/server";
import { supabase } from "@/lib/supabase";
import { normalizePhone } from "@/lib/phone";

// Minimal RFC4180-ish CSV line splitter (handles quoted fields with commas).
function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"' && text[i + 1] === '"') {
        field += '"';
        i++;
      } else if (ch === '"') {
        inQuotes = false;
      } else {
        field += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ",") {
      row.push(field);
      field = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && text[i + 1] === "\n") i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else {
      field += ch;
    }
  }
  if (field.length || row.length) {
    row.push(field);
    rows.push(row);
  }
  return rows.filter((r) => r.some((c) => c.trim() !== ""));
}

// POST /api/contacts/import - body: raw CSV text with a header row
// (phone_number, first_name, last_name, email, tags[;-separated]).
// Upserts on normalized phone_number - safe to re-run.
export async function POST(request: NextRequest) {
  const text = await request.text();
  const rows = parseCsv(text);
  if (rows.length < 2) {
    return Response.json({ error: "No data rows found" }, { status: 400 });
  }

  const header = rows[0].map((h) => h.trim().toLowerCase());
  const col = (name: string) => header.indexOf(name);
  const phoneCol = col("phone_number");
  if (phoneCol === -1) {
    return Response.json({ error: "CSV must have a phone_number column" }, { status: 400 });
  }

  let imported = 0;
  let skipped = 0;
  const errors: string[] = [];

  for (const r of rows.slice(1)) {
    const phoneNumber = normalizePhone(r[phoneCol] || "");
    if (!phoneNumber) {
      skipped++;
      continue;
    }
    const tagsCol = col("tags");
    const record = {
      phone_number: phoneNumber,
      first_name: col("first_name") >= 0 ? r[col("first_name")] || null : null,
      last_name: col("last_name") >= 0 ? r[col("last_name")] || null : null,
      email: col("email") >= 0 ? r[col("email")] || null : null,
      tags: tagsCol >= 0 && r[tagsCol] ? r[tagsCol].split(";").map((t) => t.trim()).filter(Boolean) : [],
    };

    const { error } = await supabase
      .from("contacts")
      .upsert(record, { onConflict: "phone_number" });

    if (error) errors.push(`${phoneNumber}: ${error.message}`);
    else imported++;
  }

  return Response.json({ imported, skipped, errors });
}
