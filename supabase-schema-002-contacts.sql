-- Contact Hub migration. Run in Supabase SQL Editor (project exayybmojinufmlsksqc).
-- Safe to re-run (guards with IF NOT EXISTS / ON CONFLICT).

create table if not exists contacts (
  id uuid default gen_random_uuid() primary key,
  phone_number text unique not null,      -- E.164, e.g. +971547824637
  first_name text,
  last_name text,
  email text,
  tags text[] not null default '{}',
  custom_fields jsonb not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_contacts_phone on contacts(phone_number);
create index if not exists idx_contacts_tags on contacts using gin(tags);
create index if not exists idx_contacts_custom_fields on contacts using gin(custom_fields);

-- Link conversations to contacts (one contact can have at most one WhatsApp
-- conversation today, but the FK lives on conversations so a contact can
-- gain other relations - deals, notes - later without touching this column).
alter table conversations add column if not exists contact_id uuid references contacts(id);

-- Backfill: one contact per existing conversation, deduped by normalized phone.
insert into contacts (phone_number, first_name)
select distinct on (norm) norm, name
from (
  select '+' || regexp_replace(phone, '[^0-9]', '', 'g') as norm, name, updated_at
  from conversations
) s
order by norm, updated_at desc
on conflict (phone_number) do nothing;

update conversations c
set contact_id = ct.id
from contacts ct
where ct.phone_number = '+' || regexp_replace(c.phone, '[^0-9]', '', 'g')
  and c.contact_id is null;

-- Keep updated_at current on edit.
create or replace function set_updated_at() returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_contacts_updated_at on contacts;
create trigger trg_contacts_updated_at
  before update on contacts
  for each row execute function set_updated_at();

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and tablename = 'contacts'
  ) then
    alter publication supabase_realtime add table contacts;
  end if;
end $$;
