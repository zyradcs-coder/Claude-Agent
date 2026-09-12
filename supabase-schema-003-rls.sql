-- RLS policies. Run in Supabase SQL Editor (project exayybmojinufmlsksqc).
-- Safe to re-run (drop-then-create).
--
-- App is now gated by a Supabase Auth login (see middleware.ts), so grant
-- read/write to the "authenticated" role only - not "anon". The dashboard's
-- client-side Supabase client must send the logged-in user's session JWT
-- for this to work (src/app/page.tsx uses @supabase/ssr's browser client,
-- which does this automatically).
--
-- Server-side API routes (webhook, /api/conversations, /api/contacts, ...)
-- use SUPABASE_SERVICE_ROLE_KEY, which bypasses RLS entirely - unaffected.

alter table conversations enable row level security;
alter table messages enable row level security;
alter table contacts enable row level security;

drop policy if exists "authenticated read conversations" on conversations;
create policy "authenticated read conversations" on conversations
  for select to authenticated using (true);

drop policy if exists "authenticated read messages" on messages;
create policy "authenticated read messages" on messages
  for select to authenticated using (true);

drop policy if exists "authenticated read contacts" on contacts;
create policy "authenticated read contacts" on contacts
  for select to authenticated using (true);

-- The dashboard also writes directly from the client in a couple of spots
-- (none today - all writes go through API routes with the service role key -
-- but grant write too so a future client-side edit doesn't silently 403).
drop policy if exists "authenticated write conversations" on conversations;
create policy "authenticated write conversations" on conversations
  for update to authenticated using (true) with check (true);

drop policy if exists "authenticated write contacts" on contacts;
create policy "authenticated write contacts" on contacts
  for all to authenticated using (true) with check (true);
