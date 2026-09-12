// Normalize any phone number to E.164 ("+<country><number>", digits only
// after the +). Meta sends inbound numbers as bare digits with no "+".
export function normalizePhone(phone: string): string {
  const digits = String(phone || "").replace(/[^\d]/g, "");
  return digits ? `+${digits}` : "";
}
