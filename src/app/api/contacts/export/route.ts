import { supabase } from "@/lib/supabase";

function csvEscape(value: unknown): string {
  const s = value == null ? "" : String(value);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

// GET /api/contacts/export - download all contacts as CSV
export async function GET() {
  const { data, error } = await supabase
    .from("contacts")
    .select("*")
    .order("created_at", { ascending: true });

  if (error) return Response.json({ error: error.message }, { status: 500 });

  const headers = [
    "phone_number",
    "first_name",
    "last_name",
    "email",
    "tags",
    "custom_fields",
    "created_at",
  ];
  const rows = (data || []).map((c) =>
    [
      c.phone_number,
      c.first_name,
      c.last_name,
      c.email,
      (c.tags || []).join(";"),
      JSON.stringify(c.custom_fields || {}),
      c.created_at,
    ]
      .map(csvEscape)
      .join(",")
  );
  const csv = [headers.join(","), ...rows].join("\n");

  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="contacts-${new Date().toISOString().slice(0, 10)}.csv"`,
    },
  });
}
