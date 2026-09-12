import { supabase } from "@/lib/supabase";
import { encrypt, decrypt } from "@/lib/crypto";

// BYOK vault: encrypted-at-rest key/value settings. No client-readable RLS
// policy on the `settings` table - only server code (service-role key) can
// read or write it, and values are AES-256-GCM encrypted on top of that.
export async function getSetting(key: string): Promise<string | null> {
  const { data } = await supabase.from("settings").select("value").eq("key", key).single();
  if (!data) return null;
  try {
    return decrypt(data.value);
  } catch {
    return null;
  }
}

export async function setSetting(key: string, value: string): Promise<void> {
  await supabase.from("settings").upsert({ key, value: encrypt(value) });
}

export async function deleteSetting(key: string): Promise<void> {
  await supabase.from("settings").delete().eq("key", key);
}
