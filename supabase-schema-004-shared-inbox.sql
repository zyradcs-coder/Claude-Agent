-- Shared Inbox migration. Run in Supabase SQL Editor (project exayybmojinufmlsksqc).
-- Safe to re-run.

-- Conversation lifecycle + assignment
alter table conversations
  add column if not exists status text not null default 'open'
    check (status in ('open', 'pending', 'closed')),
  add column if not exists assigned_agent_id uuid references auth.users(id);

-- Distinguish who actually sent each message (AI vs a human teammate vs
-- the customer). Existing rows default to 'customer'/'system' below.
alter table messages
  add column if not exists sender_type text not null default 'customer'
    check (sender_type in ('customer', 'agent', 'system')),
  add column if not exists sender_id uuid references auth.users(id);

update messages set sender_type = 'system' where role = 'assistant' and sender_type = 'customer';

-- Internal notes: visible to agents only, never sent to the customer.
create table if not exists internal_notes (
  id uuid default gen_random_uuid() primary key,
  conversation_id uuid references conversations(id) on delete cascade not null,
  agent_id uuid references auth.users(id),
  body text not null,
  created_at timestamptz not null default now()
);
create index if not exists idx_internal_notes_conversation on internal_notes(conversation_id);

-- Mirror of auth.users so the client can read agent names (auth.users
-- itself isn't exposed to the anon/authenticated API roles).
create table if not exists profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  display_name text,
  created_at timestamptz not null default now()
);

insert into profiles (id, email, display_name)
select id, email, coalesce(raw_user_meta_data->>'display_name', email)
from auth.users
on conflict (id) do nothing;

create or replace function handle_new_user() returns trigger as $$
begin
  insert into public.profiles (id, email, display_name)
  values (new.id, new.email, coalesce(new.raw_user_meta_data->>'display_name', new.email))
  on conflict (id) do nothing;
  return new;
end;
$$ language plpgsql security definer set search_path = public;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function handle_new_user();

alter table internal_notes enable row level security;
alter table profiles enable row level security;

drop policy if exists "authenticated read notes" on internal_notes;
create policy "authenticated read notes" on internal_notes
  for select to authenticated using (true);

drop policy if exists "authenticated write notes" on internal_notes;
create policy "authenticated write notes" on internal_notes
  for insert to authenticated with check (true);

drop policy if exists "authenticated read profiles" on profiles;
create policy "authenticated read profiles" on profiles
  for select to authenticated using (true);

do $$
begin
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'internal_notes') then
    alter publication supabase_realtime add table internal_notes;
  end if;
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'profiles') then
    alter publication supabase_realtime add table profiles;
  end if;
end $$;
