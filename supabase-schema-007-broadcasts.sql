-- Broadcast Campaigns migration. Run in Supabase SQL Editor (project exayybmojinufmlsksqc).
-- Safe to re-run.

create table if not exists broadcasts (
  id uuid default gen_random_uuid() primary key,
  name text not null,
  template_name text not null,
  template_language text not null default 'en_US',
  variable_mapping jsonb not null default '{}',  -- {"1": "first_name"} etc, maps template var index to a contact field
  segment_tag text,                               -- audience = contacts with this tag (null = all contacts)
  scheduled_at timestamptz,                        -- null = send immediately
  status text not null default 'draft'
    check (status in ('draft', 'scheduled', 'sending', 'completed', 'failed')),
  total int not null default 0,
  sent int not null default 0,
  delivered int not null default 0,
  read int not null default 0,
  failed int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists trg_broadcasts_updated_at on broadcasts;
create trigger trg_broadcasts_updated_at
  before update on broadcasts
  for each row execute function set_updated_at(); -- from migration 002

create table if not exists broadcast_recipients (
  id uuid default gen_random_uuid() primary key,
  broadcast_id uuid references broadcasts(id) on delete cascade not null,
  contact_id uuid references contacts(id) on delete set null,
  phone text not null,
  status text not null default 'pending'
    check (status in ('pending', 'sent', 'delivered', 'read', 'failed')),
  whatsapp_msg_id text,
  error text,
  sent_at timestamptz,
  delivered_at timestamptz,
  read_at timestamptz,
  created_at timestamptz not null default now(),
  unique (broadcast_id, contact_id)
);
create index if not exists idx_broadcast_recipients_broadcast on broadcast_recipients(broadcast_id, status);
create index if not exists idx_broadcast_recipients_wamid on broadcast_recipients(whatsapp_msg_id);

alter table broadcasts enable row level security;
alter table broadcast_recipients enable row level security;

drop policy if exists "authenticated all broadcasts" on broadcasts;
create policy "authenticated all broadcasts" on broadcasts
  for all to authenticated using (true) with check (true);

drop policy if exists "authenticated read broadcast_recipients" on broadcast_recipients;
create policy "authenticated read broadcast_recipients" on broadcast_recipients
  for select to authenticated using (true);

do $$
begin
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'broadcasts') then
    alter publication supabase_realtime add table broadcasts;
  end if;
end $$;
