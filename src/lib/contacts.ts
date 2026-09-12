import { supabase } from "@/lib/supabase";
import { normalizePhone } from "@/lib/phone";
import type { Contact } from "@/lib/types";

// Find a contact by phone (any format - normalized before lookup), or
// create one. Dedup key is the unique index on contacts.phone_number.
export async function upsertContact(
  phone: string,
  name: string | null
): Promise<Contact | null> {
  const phoneNumber = normalizePhone(phone);
  if (!phoneNumber) return null;

  const { data: existing } = await supabase
    .from("contacts")
    .select("*")
    .eq("phone_number", phoneNumber)
    .single();

  if (existing) {
    if (name && !existing.first_name) {
      const { data: updated } = await supabase
        .from("contacts")
        .update({ first_name: name })
        .eq("id", existing.id)
        .select()
        .single();
      return updated ?? existing;
    }
    return existing;
  }

  const { data: created, error } = await supabase
    .from("contacts")
    .insert({ phone_number: phoneNumber, first_name: name })
    .select()
    .single();

  if (error) {
    // Race with another request creating the same contact - fetch it.
    const { data: raced } = await supabase
      .from("contacts")
      .select("*")
      .eq("phone_number", phoneNumber)
      .single();
    return raced ?? null;
  }

  return created;
}
